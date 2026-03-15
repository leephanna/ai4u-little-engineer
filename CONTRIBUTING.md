# Contributing to AI4U Little Engineer

Thank you for your interest in contributing! This guide covers the development workflow, coding standards, and how to add new part families.

---

## Development Setup

### Prerequisites

- Node.js 22+, pnpm 9+
- Python 3.11+
- Docker Desktop
- A Supabase project (free tier works for development)
- OpenAI API key

### First-time setup

```bash
# 1. Clone the repository
git clone https://github.com/ai4u/little-engineer.git
cd ai4u-little-engineer

# 2. Install Node.js dependencies
pnpm install

# 3. Set up environment
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local with your credentials

# 4. Apply database schema
psql $DATABASE_URL < packages/db/schema.sql

# 5. Start the CAD worker
docker-compose up cad-worker -d

# 6. Start the web app
pnpm --filter @ai4u/web dev
```

---

## Adding a New Part Family

### Step 1: Define the family in shared types

Edit `packages/shared/src/part-families.ts` and add your family to the `PART_FAMILIES` constant and the `PartFamily` type.

### Step 2: Create the CAD generator

Create `apps/cad-worker/app/generators/{family_name}.py`:

```python
from build123d import *
from ..schemas.part_spec import PartSpec
from ..validators.dimensions import validate_dimensions

REQUIRED_DIMS = ["dim1", "dim2", "dim3"]
DEFAULTS = {"dim1": 10.0}

def generate(spec: PartSpec) -> Shape:
    """Generate a {family_name} from the given PartSpec."""
    dims = validate_dimensions(spec, REQUIRED_DIMS, DEFAULTS)
    
    with BuildPart() as part:
        # Your build123d geometry here
        pass
    
    return part.part

def get_schema() -> dict:
    """Return the JSON schema for this generator's parameters."""
    return {
        "required": REQUIRED_DIMS,
        "defaults": DEFAULTS,
        "description": "...",
    }
```

### Step 3: Register the generator

Add your generator to `apps/cad-worker/app/generators/__init__.py`:

```python
from .your_family import generate as generate_your_family, get_schema as schema_your_family

GENERATOR_REGISTRY = {
    # ... existing generators ...
    "your_family": {
        "generate": generate_your_family,
        "schema": schema_your_family,
    },
}
```

### Step 4: Add tests

Create `apps/cad-worker/tests/test_{family_name}.py` with at minimum:
- A test for the nominal case
- A test for minimum dimensions
- A test for validation rejection of invalid dimensions

### Step 5: Update the system prompt

Add your family to the system prompt in `packages/shared/src/prompts/system-prompt.ts`.

---

## Coding Standards

### TypeScript (Web App & Trigger.dev)

- Use TypeScript strict mode
- Prefer `async/await` over `.then()` chains
- Use Zod for runtime validation of external data
- API routes must validate input and return typed responses
- Use `createClient()` (anon) for user-facing operations, `createServiceClient()` only for system operations

### Python (CAD Worker)

- Python 3.11+, type hints required
- Use Pydantic v2 for all data models
- All generators must return a `Shape` object from `build123d`
- Validation errors must raise `DimensionValidationError` with a clear message
- Use `ruff` for linting: `ruff check app/`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cad): add adapter_bushing generator
fix(web): handle empty transcript in voice session
docs: update API reference for /generate endpoint
chore(ci): update Node.js to 22.x
```

---

## Pull Request Process

1. Create a branch from `develop`: `git checkout -b feat/my-feature`
2. Make your changes
3. Ensure all CI checks pass locally:
   ```bash
   pnpm turbo typecheck lint
   cd apps/cad-worker && python -m pytest tests/ -v
   ```
4. Submit a PR against `develop`
5. A maintainer will review within 2 business days

---

## Database Migrations

When changing the schema:

1. Edit `packages/db/schema.sql`
2. Create a migration file: `packages/db/migrations/YYYYMMDD_description.sql`
3. Test against a local Supabase instance
4. Include migration in your PR

---

## Questions?

Open a GitHub Discussion or reach out at ai4utech.com.

---

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
