# Marketing motion and robot sizing

The marketing site is one Next.js landing page, exported as static files.

The user requested the installed Motion and design-taste-frontend skills after rejecting the previous page. Use Motion React for scroll transforms, spring smoothing and state transitions. Remove the older design kit runtime from the page: it rewrites DOM and competed with React. Keep its assets untouched in public/assets.

The design uses the original bolt logo and the desktop robot's geometry, warm charcoal and Boltie yellow, Bricolage Grotesque headings, Manrope text and DM Mono labels. Fontsource packages bundle the Latin fonts so the design doesn't depend on Google Fonts being reachable.

The orthographic robot camera must follow the canvas's actual aspect ratio. ResizeObserver updates both the frustum and drawing buffer; transforms never change the model's proportions. Frame-rate-independent damping handles pointer tracking. The renderer stops when offscreen, paused or the document is hidden, and disposes GPU resources on unmount.

Parallax uses native scrolling, motion values and springs. There is no scroll hijacking. Mobile workflow controls are manual; reduced motion removes parallax and sticky travel. The interactive approval sequence is a marketing preview and never executes commands.
