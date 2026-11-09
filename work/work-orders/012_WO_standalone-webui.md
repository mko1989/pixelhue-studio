**Status: DEPRECATED (2026-11-09, initial HTML was only a redirect; the target browser files return 404, so a working native UI was not established)**

Follow-up: the owner reported a redirect to port 19999 and `Not FoundCannot GET /web/unico/unicos/index.html`. Read-only inspection confirmed that port 80 only serves a JavaScript redirect, and its destination plus the likely alternate vendor paths return 404. The earlier inference that the P20 serves a usable browser UI was incorrect. Owner stopped this investigation and requested the API catalog in WO-013 instead.

## Investigation FIRST

Owner asks to access a web UI without PixelFlow desktop.

- Local Pixelhue Studio is running at 127.0.0.1:3210. This answers app access, but the follow-up also requires checking the device's own browser entry point.
- This Mac's LAN IP is 192.168.0.48, distinct from the P20 at 192.168.0.7. Supplied PixelFlow OpenAPI manual page 4 explicitly defines HTTP IP:8088/unico/url, where IP is the controlled device's IP. The independent Node client communicates directly with that address.
- Read-only P20 probes: GET http://192.168.0.7/ returns 200, text/html, title `unico`; GET http://192.168.0.7:8088/ returns 404; HTTPS port 443 refuses the connection. The browser entry point is ordinary HTTP port 80; 8088 is the API endpoint.

## What was done

- Provided the direct device browser URL. No application code, running PixelFlow process or device settings changed.

## What was verified

- Device browser HTML is served directly at http://192.168.0.7/.
- Existing API documentation and implementation target the device directly. Closing PixelFlow was not used as a test, and browser login/full native UI interactions were not exercised.
