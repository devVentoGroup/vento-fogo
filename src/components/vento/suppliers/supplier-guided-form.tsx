"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SupplierGuidedFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  defaultValues?: {
    name?: string;
    tax_id?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    is_active?: boolean;
  };
};

type Step = {
  id: string;
  title: string;
  objective: string;
};

const STEPS: Step[] = [
  {
    id: "identidad",
    title: "Identidad",
    objective: "Define nombre y datos tributarios del proveedor.",
  },
  {
    id: "contacto",
    title: "Contacto",
    objective: "Define responsable y canales de contacto.",
  },
  {
    id: "operacion",
    title: "Operacion",
    objective: "Define direccion, notas operativas y estado.",
  },
  {
    id: "resumen",
    title: "Resumen",
    objective: "Verifica informacion antes de guardar.",
  },
];

function stepStatus(stepIndex: number, currentIndex: number, complete: boolean): string {
  if (stepIndex === currentIndex) return "current";
  if (stepIndex < currentIndex) return "complete";
  return complete ? "complete" : "pending";
}

function stepBadgeClass(status: string): string {
  if (status === "complete") return "border-[var(--ui-success)] bg-[var(--ui-success)]/10 text-[var(--ui-success)]";
  if (status === "current") return "border-[var(--ui-brand)] bg-[var(--ui-brand)]/10 text-[var(--ui-brand-700)]";
  return "border-[var(--ui-border)] bg-white text-[var(--ui-muted)]";
}

export function SupplierGuidedForm({
  mode,
  action,
  cancelHref,
  defaultValues,
}: SupplierGuidedFormProps) {
  const [stepId, setStepId] = useState(STEPS[0].id);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [taxId, setTaxId] = useState(defaultValues?.tax_id ?? "");
  const [contactName, setContactName] = useState(defaultValues?.contact_name ?? "");
  const [phone, setPhone] = useState(defaultValues?.phone ?? "");
  const [email, setEmail] = useState(defaultValues?.email ?? "");
  const [address, setAddress] = useState(defaultValues?.address ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [isActive, setIsActive] = useState(defaultValues?.is_active ?? true);

  const currentIndex = Math.max(
    0,
    STEPS.findIndex((step) => step.id === stepId)
  );
  const progress = STEPS.length > 1 ? ((currentIndex + 1) / STEPS.length) * 100 : 100;
  const atFirstStep = currentIndex === 0;
  const atLastStep = currentIndex === STEPS.length - 1;
  const isIdentityComplete = name.trim().length > 0;
  const canSubmit = isIdentityComplete;

  const summary = useMemo(
    () => ({
      name: name.trim() || "Sin definir",
      taxId: taxId.trim() || "Sin definir",
      contactName: contactName.trim() || "Sin definir",
      phone: phone.trim() || "Sin definir",
      email: email.trim() || "Sin definir",
      address: address.trim() || "Sin definir",
      notes: notes.trim() || "Sin definir",
      status: isActive ? "Activo" : "Inactivo",
    }),
    [name, taxId, contactName, phone, email, address, notes, isActive]
  );

  const moveStep = (delta: -1 | 1) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, currentIndex + delta));
    setStepId(STEPS[next].id);
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="tax_id" value={taxId} />
      <input type="hidden" name="contact_name" value={contactName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="is_active" value="false" />
      <input type="hidden" name="is_active" value={isActive ? "true" : "false"} />

      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="ui-caption">
            Paso {currentIndex + 1} de {STEPS.length}
          </div>
          <div className="ui-caption">{Math.round(progress)}%</div>
        </div>
        <div className="h-2 rounded-full bg-zinc-200">
          <div
            className="h-2 rounded-full bg-[var(--ui-brand)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const status = stepStatus(index, currentIndex, isIdentityComplete);
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepId(step.id)}
                aria-current={status === "current" ? "step" : undefined}
                className={`rounded-lg border px-3 py-2 text-left transition-colors hover:border-[var(--ui-brand)] ${stepBadgeClass(status)}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">Paso {index + 1}</div>
                <div className="text-sm font-semibold">{step.title}</div>
              </button>
            );
          })}
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-white p-3">
          <div className="text-sm font-semibold">{STEPS[currentIndex].title}</div>
          <div className="ui-caption mt-1">{STEPS[currentIndex].objective}</div>
        </div>
      </section>

      <section className={stepId === "identidad" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 1. Identidad</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="ui-label">Nombre *</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="ui-input mt-1"
              placeholder="Razon social o nombre"
              required
            />
          </label>
          <label>
            <span className="ui-label">NIT / Identificacion tributaria</span>
            <input
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
              className="ui-input mt-1"
              placeholder="Ej. 900.123.456-7"
            />
          </label>
        </div>
        <div className="ui-panel-soft space-y-1 p-3">
          <div className="ui-caption"><strong>Que significa:</strong> Datos legales para identificar al proveedor.</div>
          <div className="ui-caption"><strong>Cuando usarlo:</strong> Completa NIT cuando la facturacion o OC lo requiera.</div>
          <div className="ui-caption"><strong>Ejemplo:</strong> Nombre: Activa Industria SAS; NIT: 900.123.456-7.</div>
        </div>
      </section>

      <section className={stepId === "contacto" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 2. Contacto</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="ui-label">Contacto</span>
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              className="ui-input mt-1"
              placeholder="Nombre del contacto"
            />
          </label>
          <label>
            <span className="ui-label">Telefono</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="ui-input mt-1"
              placeholder="Ej. +57 300 123 4567"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="ui-label">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="ui-input mt-1"
              type="email"
              placeholder="correo@proveedor.com"
            />
          </label>
        </div>
        <div className="ui-panel-soft space-y-1 p-3">
          <div className="ui-caption"><strong>Que significa:</strong> Canales para confirmar pedidos, cambios y tiempos.</div>
          <div className="ui-caption"><strong>Cuando usarlo:</strong> Si hay un responsable de compras, registralo aqui.</div>
          <div className="ui-caption"><strong>Ejemplo:</strong> Contacto: Paula Ramirez; Tel: +57 300 123 4567.</div>
        </div>
      </section>

      <section className={stepId === "operacion" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 3. Operacion</div>
        <div className="grid gap-4">
          <label>
            <span className="ui-label">Direccion</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="ui-input mt-1"
              placeholder="Direccion fiscal o de entrega"
            />
          </label>
          <label>
            <span className="ui-label">Notas</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
              placeholder="Condiciones, horarios, observaciones..."
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--ui-border)] text-[var(--ui-brand)] focus:ring-[var(--ui-brand)]/30"
            />
            <span className="ui-label">Proveedor activo</span>
          </label>
        </div>
        <div className="ui-panel-soft space-y-1 p-3">
          <div className="ui-caption"><strong>Que significa:</strong> Parametros operativos para recepcion y comunicacion interna.</div>
          <div className="ui-caption"><strong>Cuando usarlo:</strong> Usa notas para horarios de entrega, minimos y observaciones.</div>
          <div className="ui-caption"><strong>Ejemplo:</strong> Entrega lunes a viernes de 7:00 a 11:00.</div>
        </div>
      </section>

      <section className={stepId === "resumen" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 4. Resumen y validacion</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ui-panel-soft p-3"><div className="ui-caption">Nombre</div><div className="font-semibold">{summary.name}</div></div>
          <div className="ui-panel-soft p-3"><div className="ui-caption">NIT</div><div className="font-semibold">{summary.taxId}</div></div>
          <div className="ui-panel-soft p-3"><div className="ui-caption">Contacto</div><div className="font-semibold">{summary.contactName}</div></div>
          <div className="ui-panel-soft p-3"><div className="ui-caption">Telefono</div><div className="font-semibold">{summary.phone}</div></div>
          <div className="ui-panel-soft p-3"><div className="ui-caption">Email</div><div className="font-semibold">{summary.email}</div></div>
          <div className="ui-panel-soft p-3"><div className="ui-caption">Estado</div><div className="font-semibold">{summary.status}</div></div>
          <div className="ui-panel-soft p-3 sm:col-span-2"><div className="ui-caption">Direccion</div><div className="font-semibold">{summary.address}</div></div>
          <div className="ui-panel-soft p-3 sm:col-span-2"><div className="ui-caption">Notas</div><div className="font-semibold">{summary.notes}</div></div>
        </div>
        {!canSubmit ? (
          <div className="ui-alert ui-alert--warn">Completa al menos el nombre del proveedor para guardar.</div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {!atFirstStep ? (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(-1)}>
              Anterior
            </button>
          ) : null}
          {!atLastStep ? (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(1)}>
              Siguiente
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>
            {mode === "edit" ? "Guardar cambios" : "Crear proveedor"}
          </button>
          <Link href={cancelHref} className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        </div>
      </div>
    </form>
  );
}
