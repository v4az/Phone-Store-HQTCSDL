/**
 * Custom error for insufficient stock during a sale.
 * The API route catches this and returns 409 Conflict.
 */
export class InsufficientStockError extends Error {
  public variantId: number;
  public requestedQty: number;
  public locationId: number;

  constructor(variantId: number, requestedQty: number, locationId: number) {
    super(
      `Insufficient stock for VariantId=${variantId} at LocationId=${locationId}. Requested: ${requestedQty}`
    );
    this.name = "InsufficientStockError";
    this.variantId = variantId;
    this.requestedQty = requestedQty;
    this.locationId = locationId;
  }
}
