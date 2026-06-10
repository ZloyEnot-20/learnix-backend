/**
 * Every user in the `users` collection must have exactly one type.
 * Organization entity data lives in `organizations`; org staff are users with type `admin`.
 */
export const USER_TYPES = Object.freeze({
  STUDENT: "student",
  TEACHER: "teacher",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
})

/** All valid type values (for Mongoose enum / Zod). */
export const USER_TYPE_VALUES = Object.freeze(Object.values(USER_TYPES))

/** Staff types that can access the admin panel. */
export const STAFF_TYPES = Object.freeze([
  USER_TYPES.SUPER_ADMIN,
  USER_TYPES.ADMIN,
  USER_TYPES.TEACHER,
])

export function isStaffType(type) {
  return STAFF_TYPES.includes(type)
}

export function isAdminType(type) {
  return type === USER_TYPES.SUPER_ADMIN || type === USER_TYPES.ADMIN
}

export function isSuperAdminType(type) {
  return type === USER_TYPES.SUPER_ADMIN
}

export function isStudentType(type) {
  return type === USER_TYPES.STUDENT
}

export function isTeacherType(type) {
  return type === USER_TYPES.TEACHER
}

/** Types an actor may assign when creating staff accounts. */
export function manageableTypes(actorType) {
  if (actorType === USER_TYPES.SUPER_ADMIN) return [...STAFF_TYPES]
  return [USER_TYPES.ADMIN, USER_TYPES.TEACHER]
}

export const USER_TYPE_LABELS = Object.freeze({
  [USER_TYPES.STUDENT]: "Student",
  [USER_TYPES.TEACHER]: "Teacher",
  [USER_TYPES.ADMIN]: "Organization admin",
  [USER_TYPES.SUPER_ADMIN]: "Super admin",
})
