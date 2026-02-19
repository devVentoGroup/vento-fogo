type BuildMessageParams = {
  orderId: string;
  supplierName: string;
  siteName: string;
  expectedAt?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  pdfUrl: string;
};

export function buildPurchaseOrderMessage(params: BuildMessageParams): string {
  const expectedDate = params.expectedAt
    ? new Date(params.expectedAt).toLocaleDateString("es-CO")
    : "sin fecha definida";
  const total =
    params.totalAmount != null
      ? new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency: params.currency || "COP",
        }).format(Number(params.totalAmount))
      : "pendiente";

  return [
    `Hola ${params.supplierName},`,
    `Adjuntamos la orden de compra ${params.orderId} de ${params.siteName}.`,
    `Fecha esperada: ${expectedDate}.`,
    `Total estimado: ${total}.`,
    "",
    `PDF: ${params.pdfUrl}`,
    "",
    "Gracias.",
  ].join("\n");
}

