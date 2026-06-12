"use client";

import { useCallback, useState } from "react";

export type RecipeStepLine = {
  id?: string;
  client_key?: string;
  step_number: number;
  description: string;
  tip: string;
  time_minutes: number | undefined;
  step_image_path?: string;
  step_image_url?: string;
  pending_image_name?: string;
  remove_image?: boolean;
  _delete?: boolean;
};

type Props = {
  name?: string;
  initialRows: RecipeStepLine[];
};

const MAX_STEP_IMAGE_DIMENSION = 1400;
const TARGET_STEP_IMAGE_BYTES = 700 * 1024;
const MAX_STEP_IMAGE_UPLOAD_BYTES = 1500 * 1024;
const STEP_IMAGE_QUALITY = 0.78;
const STEP_IMAGE_MIME = "image/webp";

function newClientKey() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isDisplayableImageUrl(value: string | null | undefined) {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) || url.startsWith("/");
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo optimizar la imagen."));
      },
      type,
      quality,
    );
  });
}

async function optimizeStepImageFile(file: File) {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_STEP_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("No se pudo preparar la imagen.");
  context.drawImage(image, 0, 0, width, height);

  const webpBlob = await canvasToBlob(canvas, STEP_IMAGE_MIME, STEP_IMAGE_QUALITY);
  const optimizedBlob =
    webpBlob.size < file.size || file.size > TARGET_STEP_IMAGE_BYTES
      ? webpBlob
      : file;

  if (optimizedBlob.size > MAX_STEP_IMAGE_UPLOAD_BYTES) {
    throw new Error(
      `La foto optimizada queda en ${formatBytes(optimizedBlob.size)}. Usa una imagen más liviana.`,
    );
  }

  const extension = optimizedBlob.type === "image/webp" ? "webp" : file.name.split(".").pop() || "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "paso";
  return new File([optimizedBlob], `${baseName}.${extension}`, {
    type: optimizedBlob.type || file.type || "image/jpeg",
    lastModified: Date.now(),
  });
}

async function optimizeFileInputImage(input: HTMLInputElement) {
  const file = input.files?.[0] ?? null;
  if (!file) return null;

  const optimized = await optimizeStepImageFile(file);
  if (optimized === file) return optimized;

  const transfer = new DataTransfer();
  transfer.items.add(optimized);
  input.files = transfer.files;
  return optimized;
}

function withClientKey(step: RecipeStepLine, index: number): RecipeStepLine {
  const imagePath = String(step.step_image_path ?? step.step_image_url ?? "").trim();

  return {
    ...step,
    client_key:
      step.client_key ??
      (step.id ? `existing-${step.id}` : `initial-${index + 1}-${step.step_number}`),
    step_image_path: imagePath,
    step_image_url: imagePath,
    pending_image_name: "",
    remove_image: step.remove_image === true,
  };
}

const emptyStep = (num: number, clientKey = `new-step-${num}`): RecipeStepLine => ({
  client_key: clientKey,
  step_number: num,
  description: "",
  tip: "",
  time_minutes: undefined,
  step_image_path: "",
  step_image_url: "",
  pending_image_name: "",
  remove_image: false,
});

export function RecipeStepsEditor({
  name = "recipe_steps",
  initialRows,
}: Props) {
  const [steps, setSteps] = useState<RecipeStepLine[]>(
    initialRows.length ? initialRows.map(withClientKey) : [emptyStep(1)]
  );

  const visibleSteps = steps.filter((s) => !s._delete);

  const updateStep = useCallback((index: number, patch: Partial<RecipeStepLine>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  const addStep = useCallback(() => {
    const maxNum = visibleSteps.reduce((m, s) => Math.max(m, s.step_number), 0);
    setSteps((prev) => [...prev, emptyStep(maxNum + 1, newClientKey())]);
  }, [visibleSteps]);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => {
      const step = prev[index];
      if (step?.id) {
        return prev.map((s, i) => (i === index ? { ...s, _delete: true } : s));
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const moveStep = useCallback((index: number, direction: "up" | "down") => {
    setSteps((prev) => {
      const visible = prev.filter((s) => !s._delete);
      const visIdx = visible.findIndex((s) => s === prev[index]);
      if (visIdx < 0) return prev;
      const swapVisIdx = direction === "up" ? visIdx - 1 : visIdx + 1;
      if (swapVisIdx < 0 || swapVisIdx >= visible.length) return prev;

      const a = visible[visIdx];
      const b = visible[swapVisIdx];
      const tempNum = a.step_number;

      return prev.map((s) => {
        if (s === a) return { ...s, step_number: b.step_number };
        if (s === b) return { ...s, step_number: tempNum };
        return s;
      });
    });
  }, []);

  const sortedVisible = [...visibleSteps].sort((a, b) => a.step_number - b.step_number);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(steps)} />
      <div className="flex items-center justify-between">
        <span className="ui-label">Pasos de preparacion</span>
        <button type="button" onClick={addStep} className="ui-btn ui-btn--ghost ui-btn--sm">
          + Agregar paso
        </button>
      </div>

      <div className="space-y-3">
        {sortedVisible.map((step) => {
          const realIndex = steps.findIndex((s) => s === step);
          const visIndex = sortedVisible.indexOf(step);
          const clientKey = step.client_key ?? `step-${step.step_number}`;
          const savedPhotoValue = String(step.step_image_url ?? step.step_image_path ?? "").trim();
          const hasSavedPhoto = Boolean(savedPhotoValue && !step.remove_image);
          const displayablePhotoUrl = isDisplayableImageUrl(savedPhotoValue) ? savedPhotoValue : "";
          return (
            <div key={clientKey} className="ui-panel-soft p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="ui-h3">Paso {step.step_number}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveStep(realIndex, "up")}
                    disabled={visIndex === 0}
                    className="ui-btn ui-btn--ghost ui-btn--sm disabled:opacity-30"
                    title="Mover arriba"
                  >
                    Arriba
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(realIndex, "down")}
                    disabled={visIndex === sortedVisible.length - 1}
                    className="ui-btn ui-btn--ghost ui-btn--sm disabled:opacity-30"
                    title="Mover abajo"
                  >
                    Abajo
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(realIndex)}
                    className="ui-btn ui-btn--danger ui-btn--sm"
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="ui-caption font-semibold">Instruccion</span>
                <textarea
                  rows={3}
                  value={step.description}
                  onChange={(e) => updateStep(realIndex, { description: e.target.value })}
                  className="ui-input min-h-0 py-2"
                  placeholder="Describe que hacer en este paso..."
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="ui-caption font-semibold">Tips / notas</span>
                  <input
                    type="text"
                    value={step.tip}
                    onChange={(e) => updateStep(realIndex, { tip: e.target.value })}
                    className="ui-input"
                    placeholder="Consejo operativo para quien prepara la receta"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ui-caption font-semibold">Tiempo (minutos)</span>
                  <input
                    type="number"
                    min="0"
                    value={step.time_minutes ?? ""}
                    onChange={(e) =>
                      updateStep(realIndex, {
                        time_minutes: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="ui-input"
                    placeholder="Ej. 15"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-1">
                <div className="flex flex-col gap-2">
                  <span className="ui-caption font-semibold">Foto del paso</span>
                  <input
                    type="file"
                    name={`recipe_step_image_${clientKey}`}
                    accept="image/jpeg,image/png,image/webp"
                    className="ui-input"
                    onChange={async (e) => {
                      try {
                        const file = await optimizeFileInputImage(e.currentTarget);
                        updateStep(realIndex, {
                          pending_image_name: file
                            ? `${file.name} (${formatBytes(file.size)})`
                            : "",
                          remove_image: file ? false : step.remove_image,
                        });
                      } catch (error) {
                        e.currentTarget.value = "";
                        const message =
                          error instanceof Error
                            ? error.message
                            : "No se pudo optimizar la foto.";
                        updateStep(realIndex, {
                          pending_image_name: message,
                          remove_image: step.remove_image,
                        });
                      }
                    }}
                  />
                  <div className="space-y-1 text-xs text-[var(--ui-muted)]">
                    {hasSavedPhoto ? (
                      <p>Esta receta ya tiene una foto guardada para este paso.</p>
                    ) : null}
                    {step.pending_image_name ? (
                      <p>Nueva foto seleccionada: {step.pending_image_name}. Se subirá cuando guardes la receta.</p>
                    ) : null}
                    {step.remove_image ? (
                      <p>La foto guardada se eliminará cuando guardes la receta.</p>
                    ) : null}
                    <p>Formatos permitidos: JPG, PNG o WEBP. Se optimiza automáticamente antes de subir.</p>
                  </div>
                  {displayablePhotoUrl && hasSavedPhoto ? (
                    <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayablePhotoUrl}
                        alt={`Foto del paso ${step.step_number}`}
                        className="max-h-64 w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : null}
                  {hasSavedPhoto ? (
                    <div>
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                        onClick={() =>
                          updateStep(realIndex, {
                            remove_image: true,
                            pending_image_name: "",
                          })
                        }
                      >
                        Quitar foto guardada
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {sortedVisible.length === 0 ? (
          <div className="ui-empty-state">Sin pasos definidos.</div>
        ) : null}
      </div>
    </div>
  );
}
