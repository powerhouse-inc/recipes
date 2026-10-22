// Stands in for a generated editor list. A real editor would render
// `brandSwatchClass` on an element; here the class string only has to reach
// dist/browser, where `ph build` looks for classes. Its first class reads the
// package's own token, so that token ships in dist/style.css; its second reads
// one of Connect's, which the page supplies. A class named only in a comment,
// such as underline here, stays out: `ph build` skips dist/browser's source
// maps, which keep this comment.
export const brandSwatchClass = "bg-brand text-red-700";

export const editors: unknown[] = [];
