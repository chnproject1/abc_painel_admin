export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/api/search", "/api/pedido/:path*", "/api/trigger/:path*"],
  // /api/checkout é público (chamado pelo checkout e AbacatePay)
};
