// Stands in for a generated editor list. A real editor would render
// `brandSwatchClass` on an element; here the class string only has to reach
// dist/browser, where `ph build` looks for classes. Its first class reads the
// package's own token, so that token ships in dist/style.css; its second reads
// one of Connect's, which the page supplies. (Not spelled out here: `ph build`
// scans dist/browser's source maps too, comments included.)
export const brandSwatchClass = "bg-brand text-red-700";

export const editors: unknown[] = [];
