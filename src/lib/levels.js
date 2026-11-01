// One place for the number of student / exam levels. Change MAX_LEVEL here (and in the SQL check) to add more.
export const MAX_LEVEL = 14;
export const LEVEL_LIST = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
