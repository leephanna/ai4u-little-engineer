# AI4U Trust Policy Engine — Marketplace Gating

The Trust Policy Engine enforces marketplace eligibility at two levels: the listing page and the checkout API. This ensures that only verified and trusted commercial designs are available for purchase or public viewing.

## Gating Mechanisms

### 1. Listing Page (`apps/web/app/marketplace/page.tsx`)
The marketplace listing page queries the `projects` table and filters out projects where `marketplace_allowed` is false. This prevents unverified or low-confidence designs from appearing in the marketplace.

**Filter Logic:**
```typescript
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .eq('marketplace_allowed', true)
  .order('created_at', { ascending: false });
```

### 2. Checkout API (`apps/web/app/api/marketplace/checkout/route.ts`)
The checkout API enforces the trust policy by blocking purchases if the project's trust tier does not permit sales.

**Gating Logic:**
```typescript
if (!project.marketplace_allowed) {
  return NextResponse.json(
    { error: 'This design is not eligible for marketplace sales.' },
    { status: 403 }
  );
}
```

## Trust Badge Component (`apps/web/components/TrustBadge.tsx`)
The `TrustBadge` component visually indicates the trust tier of a project on the marketplace listing page. It displays a badge with the corresponding tier label and color.

**Badge Colors:**
- `TRUSTED_COMMERCIAL`: Green
- `VERIFIED`: Blue
- `LOW_CONFIDENCE`: Yellow
- `UNVERIFIED`: Red

## Hard Rules Enforced
1. **Strict Gating**: Unverified or low-confidence designs are strictly blocked from the marketplace.
2. **Public Listing**: Verified designs can appear in the library but cannot be sold unless explicitly priced.
3. **Trusted Commercial**: Only designs with a strong VPL result and active exposure are eligible for marketplace sales.
