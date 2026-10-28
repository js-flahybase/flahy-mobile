# Apple Wallet pass endpoint: backend spec

The mobile app already supports Google Wallet through
`GET /api/wallet/google-pass-report?report_id=<id>`.
For iOS we need the Apple equivalent. The app side is built and waiting on this endpoint.

## Endpoint

`GET /api/wallet/apple-pass-report?report_id=<id>`

- Same auth as `google-pass-report` (`Authorization: Bearer <token>`).
- Same report lookup and ownership check (report must belong to the logged-in user).
- Used only for PNG reports (the DNA Signature / `qr_flahy.png` card), same as Google.

### Success response (HTTP 200)

```json
{
  "status": 200,
  "data": { "pass_base64": "<base64 of the signed .pkpass file>" }
}
```

The app also accepts `pass_base64` at the top level of the JSON.

### Errors

| Case | HTTP | Body |
|---|---|---|
| Missing/invalid token | 401 | `{"errors":[{"message":"Unauthorized access"}]}` |
| Report not found / not the user's | 404 | `{"message":"..."}` |
| Signing failure | 500 | `{"message":"..."}` (the app shows `message` to the user) |

## Pass details

A `.pkpass` is a ZIP containing `pass.json`, images, `manifest.json` (SHA-1 of every file)
and `signature` (detached PKCS#7 of `manifest.json`).

### Apple setup (already done)

- Pass Type ID: `pass.app.flahyhealth.com.dnasignature`
- Team ID: `676SBB92TU`
- Still needed from us: the Pass Type ID signing certificate + private key (`.p12`), shared over a secure channel.
  Also download Apple's **WWDR G4** intermediate certificate for signing.

### `pass.json`

```json
{
  "formatVersion": 1,
  "passTypeIdentifier": "pass.app.flahyhealth.com.dnasignature",
  "teamIdentifier": "676SBB92TU",
  "organizationName": "Flahy",
  "description": "Flahy DNA Signature",
  "serialNumber": "<unique per report, e.g. the report id>",
  "logoText": "Flahy",
  "foregroundColor": "rgb(255,255,255)",
  "backgroundColor": "rgb(27,31,77)",
  "labelColor": "rgb(200,205,230)",
  "barcodes": [
    {
      "format": "PKBarcodeFormatQR",
      "message": "<same value the Google pass encodes in its QR>",
      "messageEncoding": "iso-8859-1"
    }
  ],
  "storeCard": {
    "primaryFields": [{ "key": "name", "label": "NAME", "value": "<Firstname L.>" }],
    "secondaryFields": [{ "key": "type", "label": "CARD", "value": "DNA Signature" }]
  }
}
```

- `storeCard` is recommended: it supports a strip image and the QR, which matches the card design.
  `generic` is fine too.
- **Use the native `barcodes` field.** Wallet renders and scans it itself. Do not rely on the QR baked into the PNG.
- `barcodes` (plural) is the current key; add the legacy `barcode` too if you need iOS 8 support (we don't).
- Pick `backgroundColor` per theme if the card theme (indigo / ember / moss / orchid) is known.

### Images (in the ZIP root)

| File | Size (1x / 2x / 3x) | Notes |
|---|---|---|
| `icon.png`, `icon@2x.png`, `icon@3x.png` | 29x29 / 58 / 87 | Required |
| `logo.png`, `logo@2x.png`, `logo@3x.png` | up to 160x50 (1x) | Flahy logo |
| `strip.png`, `strip@2x.png`, `strip@3x.png` | 375x98 / 750x196 / 1125x294 | The report PNG (DNA Signature art), cropped/scaled to fit |

If the report image is square, the circular art can be used as `thumbnail` (90x90) instead of a strip.

## Notes for testing

- The app sends the request and shows the Apple "Add Pass" sheet directly from `pass_base64`.
- Wallet rejects a pass with a bad signature, a wrong `passTypeIdentifier`/`teamIdentifier`,
  a missing icon, or a wrong manifest hash. If the sheet doesn't appear, the app shows
  "Could not add the pass".
- Quick local check on macOS: save the base64 to a `.pkpass` file and open it (Quick Look / double click).
  If it opens in Wallet's add sheet, the signature is valid.
- It must be tested on a real iPhone (the iOS Simulator is unreliable for passes).
