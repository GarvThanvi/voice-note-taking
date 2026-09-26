const PAGE_TITLES: Record<string, string> = {
  all: "All Notes",
  archive: "Archive",
  trash: "Trash",
  bookmark: "Bookmark",
};

const EMPTY_MESSAGES: Record<string, string> = {
  trash: "Trash is empty",
  archive: "No archived notes",
};

export const getPageTitle = (filter: string): string =>
  PAGE_TITLES[filter] ?? "All Notes";

export const getEmptyMessage = (filter: string): string =>
  EMPTY_MESSAGES[filter] ?? "No notes found";
