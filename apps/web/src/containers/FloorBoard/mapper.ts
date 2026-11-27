export type FloorBoardFilters = {
  sectionId: string;
  statusCode: string;
  search: string;
  /** Assign-captains mode only: show tables without a captain. */
  noCaptain: boolean;
};

export function getFloorBoardFilterDefaults(): FloorBoardFilters {
  return { sectionId: '', statusCode: '', search: '', noCaptain: false };
}
