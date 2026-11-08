# MiniMarket project instructions

MiniMarket is a lightweight marketplace application.
Main functionality:
- Users can register, log in, and log out.
- Visitors can browse and search advertisements.
- Registered users can create advertisements with a title, description, price, category, and image.
- Users can edit and delete their own advertisements.
- Users can save advertisements to their favorites.
- Users can view and manage their own advertisements.
- Administrators can manage advertisements and categories.
Keep the application focused on these core features.
Do not implement shopping carts, payments, messaging, shipping, bidding, or other advanced marketplace functionality.
- Vanilla JavaScript using ES modules.
- HTML5 and CSS3.
- Vite for development and building.
- Bootstrap 5 for responsive layouts and UI components.
- Bootstrap Icons for interface icons.
- Supabase for database, authentication, and file storage (to be integrated later).
- Git and GitHub for version control.
- Netlify for deployment.
Architecture guidelines:
- Use a client-server architecture.
- Keep the frontend independent from backend implementation details.
- Separate HTML, CSS, and JavaScript files for pages and substantial components.
- Use reusable components for the header, footer, navigation, and advertisement cards.
- Create dedicated services for database operations, authentication, and file storage.
- Create utility modules for form validation, formatting prices, and safe rendering.
- HTML fragments must not contain html, head, or body elements.
- Use one client-side router based on the History API.
- Keep each page in a separate module or file.
- Clean up page event listeners and subscriptions when unmounting.
- Use asynchronous functions for future Supabase operations.
- Avoid unnecessary dependencies, frameworks, and complex design patterns.
- Create a modern, clean, and responsive marketplace interface.
- Use Bootstrap components and utilities.
- Support desktop, tablet, and mobile screens.
- Use a consistent color palette, typography, spacing, and button styles.
- Display advertisements as cards with an image, title, price, and category.
- Provide clear navigation and intuitive forms.
- Include loading, empty, success, and error states where appropriate.
- Use confirmation dialogs for destructive actions.
- Keep the interface simple and user-friendly.
Use the following canonical routes:
- / – Home page with advertisements.
- /login – User login.
- /register – User registration.
- /listings – Browse and search advertisements.
- /listings/:id – Advertisement details.
- /listings/add – Create a new advertisement.
- /listings/:id/edit – Edit an existing advertisement.
- /my-listings – Manage the current user's advertisements.
- /favorites – View saved advertisements.
- /admin – Administrator dashboard.
Navigation guidelines:
- Use a single client-side router with the History API.
- Use separate page modules.
- Provide a shared header and footer.
- Restrict protected pages to authenticated users.
- Restrict the admin dashboard to administrators.
- Include a simple Not Found page for invalid routes.
- Ensure direct navigation and page refresh work correctly after Netlify deployment.
Supabase will be integrated in a later phase.
Plan the database around these main tables:
1. profiles – User profile information and role.
2. categories – Advertisement categories.
3. listings – Advertisement details, price, owner, category, and image reference.
4. favorites – Relationships between users and saved advertisements.
Database guidelines:
- Use UUID primary keys.
- Use foreign keys for table relationships.
- Include timestamps where appropriate.
- Use Supabase Storage for advertisement images.
- Use Supabase migrations for database schema changes.
- Store and synchronize SQL migrations in the project repository.
- Keep database operations inside dedicated service modules.
- Do not hardcode credentials or secrets.
- Use environment variables for Supabase configuration.
- Never expose a Supabase service-role key in frontend code.
- Use Supabase Auth for registration, login, and logout.
- Support two user roles: user and admin.
- Regular users can create, edit, and delete only their own advertisements.
- Administrators can manage all advertisements and categories.
- Visitors can browse advertisements without authentication.
- Authenticated users can manage their own favorites.
- Use Supabase Row-Level Security (RLS) as the authorization boundary.
- Do not rely only on frontend route protection for security.
- Plan secure database policies for users and administrators.
- Never allow users to assign themselves the administrator role.
- Implement the application incrementally.
- Keep features small and independently testable.
- Prefer simple solutions over complex abstractions.
- Avoid duplicated code.
- Use descriptive variable and function names.
- Follow consistent naming conventions.
- Do not introduce unnecessary functionality.
- Keep the project suitable for AI-assisted development with Codex.
- Maintain a clear Git commit history throughout development.

## Current phase: demo data seeding

The shell, database/RLS setup, and service layer are complete. This phase adds a server-only Node.js demo seed using the Auth Admin API and the existing four tables. Pin execution to the confirmed MiniMarket project, keep privileged credentials in ignored local environment configuration, support dry runs and safe reruns, and verify actual created/skipped counts. Do not change schema/RLS, overwrite unrelated data, or implement frontend functionality, uploads, Storage, additional features, or deployment. Wait for further instructions after seeding and verification.

See ARCHITECTURE.md for the architecture plan and proposed folder structure.

