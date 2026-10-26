export interface PricingConfig {
  regularPrice: string;
  discountedPrice: string;
  isDiscountActive: boolean;
  promoTitle: string;
  promoNote: string;
  includedAudits: number;
  creditPackAudits: number;
  creditPackPrice: string;
  creditPackUrl: string;
}

export function getPricingConfig(): PricingConfig {
  const regularPrice = process.env.NEXT_PUBLIC_REGULAR_PRICE || "$24.99";
  const discountedPrice = process.env.NEXT_PUBLIC_PROMO_PRICE || "$17.99";
  const isDiscountActive = process.env.NEXT_PUBLIC_IS_PROMO_ACTIVE !== "false";
  const promoTitle = process.env.NEXT_PUBLIC_PROMO_TITLE || '⚡ EARLY BIRD SALE';
  const promoNote = process.env.NEXT_PUBLIC_PROMO_NOTE || 'Special launch pricing active for the first 100 traders. Price increases to $24.99 once initial seats fill.';
  const creditPackUrl = process.env.NEXT_PUBLIC_WHOP_CREDIT_PACK_URL || "https://whop.com/clearertrade";
  const creditPackPrice = process.env.NEXT_PUBLIC_CREDIT_PACK_PRICE || "$1.99";
  const creditPackAudits = Number(process.env.NEXT_PUBLIC_CREDIT_PACK_AUDITS || 50);

  const includedAudits = Number(process.env.NEXT_PUBLIC_INCLUDED_AUDITS || 240);

  return {
    regularPrice,
    discountedPrice,
    isDiscountActive,
    promoTitle,
    promoNote,
    includedAudits,
    creditPackAudits,
    creditPackPrice,
    creditPackUrl,
  };
}

