import generatedProduct from "../generated/public-product.json";

export type PublicProductConfig = {
  code: string;
  identity: {
    name: string;
    productLabel: string;
    accent: string;
  };
  apiHostname: string;
  dashboardHostname: string;
  canonicalHostname: string;
  hostnames: readonly string[];
  deploymentTarget: "cloudflare-workers";
  branding: {
    name: string;
    shortName: string;
    description: string;
    locale: string;
    themeColor: string;
    backgroundColor: string;
  };
};

export const PUBLIC_PRODUCT = generatedProduct as PublicProductConfig;
export const PUBLIC_PRODUCT_URL = `https://${PUBLIC_PRODUCT.canonicalHostname}`;
export const PUBLIC_PRODUCT_API_URL = `https://${PUBLIC_PRODUCT.apiHostname}`;
export const PUBLIC_PRODUCT_DASHBOARD_URL = `https://${PUBLIC_PRODUCT.dashboardHostname}`;
