export const ROLE_OVERRIDE_COOKIE = "origo_role_override";

export const PRIVILEGED_ROLE_OVERRIDES = new Set([
  "propietario",
  "gerente_general",
]);

export const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "propietario", label: "Propietario" },
  { value: "gerente_general", label: "Gerente general" },
  { value: "gerente", label: "Gerente" },
  { value: "bodeguero", label: "Bodeguero" },
  { value: "cajero", label: "Cajero" },
  { value: "mesero", label: "Mesero" },
  { value: "barista", label: "Barista" },
  { value: "cocinero", label: "Cocinero" },
  { value: "panadero", label: "Panadero" },
  { value: "repostero", label: "Repostero" },
  { value: "pastelero", label: "Pastelero" },
  { value: "conductor", label: "Conductor" },
  { value: "compras", label: "Compras" },
  { value: "logistica", label: "Logística" },
];
