interface PageChromeMeta {
  footerVisible?: boolean;
}

export function shouldRenderFooter(
  meta: PageChromeMeta | null | undefined,
): boolean {
  return meta?.footerVisible !== false;
}
