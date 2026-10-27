# Video thumbnail recovery

Cold thumbnail generation used a 200 ms response limit. When FFmpeg took longer, the API returned a successful SVG placeholder, which the browser displayed and cached without checking again. The generated JPEG could exist while the page continued showing “Video”.

The API now marks pending/failed placeholders with distinct intrinsic dimensions and does not cache them. The frontend uses a versioned thumbnail URL to bypass previously cached placeholders, refreshes only visible pending covers with bounded backoff, coalesces duplicate covers, and stops after a real image loads. Failed decodes have a 60 second cooldown and two client retries. Lists still never fetch the MP4 itself.

FFmpeg uses two bounded workers, one decoding/filter thread per worker, an eight second timeout, a 24 job admission limit, and atomic JPEG publication. Access checks still precede file reads. `scripts/diagnose-thumbnails.mjs` checks FFmpeg and samples six local video thumbnails without printing names, media URLs, tokens or customer data.

Validation: thumbnail queue/refresh, access and snapshot tests; isolated browser regression at 390/840/1100/1440 px with pending SVG followed by real JPEG and no list MP4 requests. The Android TWA receives the frontend on reload; the VPS must also run this backend release.
