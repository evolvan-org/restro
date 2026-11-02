export type FloorBoardFilters = {
  sectionId: string;
  statusCode: string;
  search: string;
};

export function getFloorBoardFilterDefaults(): FloorBoardFilters {
  return { sectionId: '', statusCode: '', search: '' };
}
