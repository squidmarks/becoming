# lib/

Local libraries for the ESP32 Helm Display project.

Place third-party library source here when it's not available on the PlatformIO
registry, or when you need a patched version.

## Planned local libraries

| Directory        | Purpose                                              |
|------------------|------------------------------------------------------|
| `CST816Touch/`   | CST816/CST820 capacitive touch driver (from Waveshare sample) |
| `ST7701S/`       | ST7701S RGB panel init sequence (from Waveshare sample) |

## Obtaining Waveshare sample code

```
git clone https://github.com/waveshareteam/ESP32-S3-Touch-LCD-4.git waveshare-sample
```

Copy the relevant driver files from the sample into the appropriate subdirectory here.
