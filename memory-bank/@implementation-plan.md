# UI Improvements Plan (✅ 已完成 - 2026-01-18)

> **注**: 此计划已于 2026-01-18 完成。最新的开发工作请参见 [@progress.md](file:///Users/whpeng/workspace/student%20c/memory-bank/@progress.md)

## Goal Description
1.  **Disable Q&A Feature**: The "Smart Q&A" (Insight Chat) feature is not ready. The entrance should be disabled and labeled as "Under Development".
2.  **Open Analysis in New Page**: To allow multitasking, the "Email Analysis" feature should open in a separate browser tab or window instead of a modal.

## Proposed Changes

### Frontend

#### [COMPLETED] Frontend Improvements
-   **[NEW]** Single Cluster Analysis ⚡ Button Fixed.
-   **[NEW]** UI State Optimization: Eliminated table reload/flash during analysis.
-   **[NEW]** Layout Stability: Fixed column width to prevent shifts.

#### Component: `frontend/src/App.tsx`
-   **[COMPLETED]** Add logic to parse URL query parameters (`view`, `taskId`, `taskName`) at startup.
-   **[COMPLETED]** If `view=analyzer` is detected, render *only* the `EmailAnalyzer` component in a standalone mode (no dashboard layout).
-   **[COMPLETED]** Update the "Analysis" button in the task list to `window.open` the app with these query parameters.
-   **[COMPLETED]** Disable the "Insight Chat" button and update its text/tooltip.

#### [COMPLETED] Data Import Enhancements
-   **[NEW] Smart Column Mapping**: Automatically detect and map fields like `sender`, `rcpt`, `@timestamp` based on predefined keywords.
-   **[NEW] Filter Preview**: Calculate and display the number of rows to be imported vs. excluded based on active filter rules.

#### Component: `frontend/src/components/EmailAnalyzer.tsx`
-   **[COMPLETED]** Add an `isStandalone` prop.
-   **[COMPLETED]** Conditionally render the modal overlay. If `isStandalone` is true, render as a full-screen page without the black backdrop and rounded corners.

## Verification
-   **Q&A Button**: Check that the button is disabled and shows "Developing...".
-   **Analysis Button**: Click "Analyze". Verify a new tab opens.
-   **New Tab**: Verify the new tab loads *only* the Email Analyzer interface and it fills the screen properly.
