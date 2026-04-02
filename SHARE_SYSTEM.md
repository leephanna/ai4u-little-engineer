# AI4U Share System

## Overview
The Share System transforms AI4U Little Engineer designs from isolated files into highly shareable, visually compelling social assets. It bridges the gap between technical CAD generation and public showcasing, allowing users to easily share their creations with a polished, branded preview card.

## Components

### 1. ShareCard Component (`ShareCard.tsx`)
The core of the visual sharing experience. This React component generates a rich, branded preview card that can be screenshotted or shared natively.

**Features:**
- **Visual Hierarchy:** Prioritizes the AI-generated project image (if available) or a stylized placeholder.
- **Data Density:** Displays the design title, part family, VPL score, VPL grade, and Trust Tier badge in a compact, readable format.
- **Brand Authority:** Integrates the `BrandSignatureBlock` (compact variant) to ensure every shared image carries the AI4U stamp.
- **Actionable:** Includes the shareable URL and buttons for copying the link or triggering the native device share dialog.
- **Responsive Design:** Scales gracefully from mobile screens to desktop modals.

### 2. Enhanced SharePanel (`SharePanel.tsx`)
The existing `SharePanel` on the job detail page was upgraded to integrate the new visual sharing flow.

**Enhancements:**
- **"Share Preview Card" Button:** A new primary action that opens the `ShareCard` modal when sharing is enabled.
- **State Management:** Handles the visibility of the modal and passes all necessary design metadata (title, score, image URL, etc.) to the `ShareCard`.
- **Seamless Integration:** Maintains the original functionality (generating and copying the raw link) while adding the visual layer.

### 3. Native Sharing API
The `ShareCard` leverages the Web Share API (`navigator.share`) when available (typically on mobile devices or modern desktop browsers).

**Functionality:**
- **Pre-filled Content:** Automatically populates the share dialog with a formatted title, description (including VPL grade and the "Designed to Work — Verified by AI4U" tagline), and the shareable URL.
- **Fallback:** Gracefully falls back to a simple "Copy Link" button if the Web Share API is not supported by the user's browser.

## Design Philosophy
The Share System is designed to maximize the viral potential of AI4U designs. By providing a beautiful, data-rich preview card, users are more likely to share their creations on social media, forums, or messaging apps. The prominent inclusion of the VPL score and Trust Tier badge serves as a powerful marketing tool, demonstrating the platform's unique value proposition (validated, printable AI designs) to a wider audience.

## Future Enhancements
- **Server-Side Image Generation (OG Images):** Implement a dynamic Open Graph image generator (e.g., using `@vercel/og`) so that the `ShareCard` visual is automatically displayed when the link is pasted into platforms like Twitter, Discord, or Slack.
- **Direct Social Integration:** Add specific buttons for sharing directly to Twitter, Reddit (e.g., r/3Dprinting), or Facebook.
