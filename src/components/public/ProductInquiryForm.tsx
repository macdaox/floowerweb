export interface ProductInquiryFields {
  productId: string;
  productName: string;
  sourceRoute: string;
}

/** Keeps product-form values explicit until the inquiry API is connected. */
export function productInquiryFields(productId: string, productName: string, sourceRoute: string): ProductInquiryFields {
  return { productId, productName, sourceRoute };
}
