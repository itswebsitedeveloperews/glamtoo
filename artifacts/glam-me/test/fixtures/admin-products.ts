// Synthetic browser-only state. Never submitted to Clerk or the shop API.
const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='pink'/%3E%3C/svg%3E";

export const adminProducts = [
  {
    id: 91001, slug: "fixture-published-jacket", name: "Fixture published jacket",
    category: "Coats", price: "£25.00", stock: 5, status: "Published",
    type: "Simple", description: "", image, position: "50% 50%",
    sku: "fixture-jacket", variations: [],
  },
  {
    id: 91002, slug: "fixture-draft-top", name: "Fixture draft top",
    category: "Tops", price: "£18.00", stock: 2, status: "Draft",
    type: "Simple", description: "", image, position: "50% 50%",
    sku: "fixture-top", variations: [],
  },
];

// Include the existing category IDs so the dashboard's legacy migration does
// not attempt to publish missing defaults. All names/media are local fixtures.
const categoryIds = [1, 2, 3, 4, 5, 201, 202, 203, 204, 205, 206, 501, 502, 503, 504];
export const adminCatalog = {
  initialized: true,
  products: adminProducts,
  categories: categoryIds.map((id) => ({
    id, name: `Fixture category ${id}`, slug: `fixture-category-${id}`,
    image, description: "", parentId: null,
  })),
  homePage: { categoryIds: [], obsessionIds: [], momentIds: [] },
};

// Replace only the browser's Vite auth module, not production code. The real
// AdminRoute still requires its separately mocked /api/admin/access response.
export const authorizedAdminModule = `
  const auth = { isLoaded: true, isSignedIn: true, userId: "user_fixture_admin" };
  export const useAuth = () => auth;
  export const useUser = () => ({ ...auth, user: { id: auth.userId } });
  const forbidden = () => { throw new Error("Auth action forbidden in read-only admin fixture"); };
  export const useClerk = () => ({ signOut: forbidden, openSignIn: forbidden, openSignUp: forbidden });
  export const useSignIn = () => ({});
  export const ClerkProvider = ({ children }) => children;
  export const SignIn = () => null;
  export const SignUp = () => null;
`;
