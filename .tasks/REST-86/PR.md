## Context

Reservations, Menu Items, and Inventory use the shared application sidebar. Their sidebar should scroll like the Dashboard, Orders, and Billing sidebars.

## Problem

- Long page content can stretch the desktop sidebar beyond the viewport and push the bottom navigation out of view.
- The middle navigation can grow with the sidebar instead of scrolling within the visible space.

## Solution

Keep the desktop sidebar in view as the page scrolls. When the middle navigation overflows, users can scroll it to reach every link while the header and bottom navigation stay visible.

## Implementation

- Set the desktop `AppSidebar` to the dynamic viewport height and make it sticky at the top of the page.
- Allow the shared `SidebarNav` to shrink into the available space and scroll vertically when its contents overflow.
- Prevent the header and footer from shrinking in the desktop sidebar and mobile drawer.

## Jira Ticket

[REST-86](https://restaurant-dev.atlassian.net/browse/REST-86)
