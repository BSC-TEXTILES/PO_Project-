const user = { id: 'ui-review-only', fullName: 'UI Reviewer', roles: ['super_admin'], permissions: [], isSuperAdmin: true, profileUpdatedAt: 'review', divisionIds: [], sectionIds: [] };
const noop = () => {};
export const useAuth = () => ({ user, loading: false, isSignedIn: true, hasPermission: () => true, hasRole: () => false, selectedSectionId: null, selectedLocation: 'All Locations', selectLocation: noop, clearLocation: noop, selectSection: noop, clearSection: noop, canAccessSection: () => true, updateUser: noop, logout: noop });
export const useCart = () => ({ items: [], count: 0, addItem: noop, removeItem: noop, clear: noop });
