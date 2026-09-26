# Typography files

The package intentionally does not redistribute proprietary Apple font binaries.

## Exact platform choice

- iOS display: **New York Large**, Regular (400).
- iOS utility/body: **SF Pro Text**, Regular (400) and Medium (500).
- Android/cross-platform display: **Cormorant Garamond**, Regular (400) and Medium (500).
- Android/cross-platform utility/body: **Inter**, Regular (400), Medium (500) and Semibold (600).

For a React Native build, bundle licensed Cormorant Garamond and Inter files for consistent iOS/Android rendering, or use Apple system faces on iOS and accept small platform typography differences. Preserve the font licenses beside the binaries.

Do not use Playfair Display, Times New Roman, Poppins or Montserrat as substitutes; they alter the product’s tone and metrics.

