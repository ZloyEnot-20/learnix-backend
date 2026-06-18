/** Granular staff permissions (granted by super admin to teachers). */
export const STAFF_PERMISSIONS = {
  STUDENTS_VIEW_ALL: "students.view_all",
  GROUPS_VIEW_ALL: "groups.view_all",
  HOMEWORK_VIEW_ALL: "homework.view_all",
  CONTROL_WORKS_VIEW_ALL: "control_works.view_all",
  PAYMENTS_VIEW_ALL: "payments.view_all",
  ENTRY_TESTS_VIEW_ALL: "entry_tests.view_all",
}

export const STAFF_PERMISSION_VALUES = Object.values(STAFF_PERMISSIONS)

export const STAFF_PERMISSION_CATALOG = [
  {
    key: STAFF_PERMISSIONS.STUDENTS_VIEW_ALL,
    label: "View all students",
    description: "See every student in the organization, not only those in assigned groups.",
  },
  {
    key: STAFF_PERMISSIONS.GROUPS_VIEW_ALL,
    label: "View all groups",
    description: "See and open every group, not only groups assigned to this teacher.",
  },
  {
    key: STAFF_PERMISSIONS.HOMEWORK_VIEW_ALL,
    label: "View all homework",
    description: "See homework for all groups, not only assigned ones.",
  },
  {
    key: STAFF_PERMISSIONS.CONTROL_WORKS_VIEW_ALL,
    label: "View all progress tests",
    description: "See progress tests for all groups.",
  },
  {
    key: STAFF_PERMISSIONS.PAYMENTS_VIEW_ALL,
    label: "View all payments",
    description: "See payment records for all groups and students.",
  },
  {
    key: STAFF_PERMISSIONS.ENTRY_TESTS_VIEW_ALL,
    label: "View all entry tests",
    description: "See entry / placement tests for all candidates.",
  },
]
