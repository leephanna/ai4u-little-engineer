# AI4U Visual Generation System

## Overview
The Visual Generation System automatically creates high-quality, AI-generated images for every 3D design produced by the AI4U Little Engineer platform. This transforms abstract CAD files into compelling, real-world visualizations, enhancing the marketplace appeal and shareability of the designs.

## Architecture

### 1. Database Schema (`project_images`)
A new table, `project_images`, was added via migration `009_brand_visual_layer.sql` to store the generated images.

**Schema:**
- `id`: UUID (Primary Key)
- `project_id`: UUID (Foreign Key to `projects`)
- `image_type`: Text (`render` | `context`)
- `url`: Text (The URL of the generated image)
- `created_at`: Timestamp

### 2. Image Generation API (`/api/projects/[projectId]/images`)
A dedicated API route handles the generation of images using the OpenAI DALL-E 3 model.

**Process:**
1. **Authentication:** Verifies the user owns the project.
2. **Context Gathering:** Fetches the project title, description, and part family.
3. **Prompt Engineering:** Constructs a detailed prompt for DALL-E 3, specifying a photorealistic, high-quality 3D render of the part in a professional studio setting or real-world context.
4. **Generation:** Calls the OpenAI API to generate the image.
5. **Persistence:** Saves the resulting image URL to the `project_images` table.

### 3. UI Display (`ProjectImageGallery.tsx`)
A reusable React component that displays the generated images for a project.

**Features:**
- Fetches images from the `project_images` table.
- Displays a primary image and thumbnails for additional images.
- Includes a "Generate AI Render" button for project owners to trigger the generation process.
- Handles loading states and errors gracefully.

**Integration Points:**
- **Job Detail Page (`/jobs/[id]`):** Rendered prominently after the spec summary, providing immediate visual feedback on the generated design.
- **Marketplace Cards:** The primary image is used as the thumbnail for the design in the marketplace, significantly improving the visual appeal of the listings.

## Design Philosophy
The visual system prioritizes photorealism and professional presentation. The prompts are engineered to produce images that look like high-end product photography, reinforcing the "cutting-edge" and "premium" brand identity of AI4U.

## Future Enhancements
- **Multiple Image Types:** Expand the `image_type` to include specific contexts (e.g., "in use," "exploded view," "blueprint style").
- **Automated Generation:** Trigger image generation automatically upon successful VPL validation, rather than requiring manual user action.
- **Image Editing:** Allow users to regenerate or edit images using natural language prompts.
