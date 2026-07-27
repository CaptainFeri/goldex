# Training Data

Place your Persian text line images and ground truth files here.

## Format

Each image must have a matching `.gt.txt` file with the same base name:

```
data/
├── sample_001.png
├── sample_001.gt.txt    # contains: "متن فارسی نمونه"
├── sample_002.png
├── sample_002.gt.txt
└── ...
```

## Recommended Dataset Size

| Task | Min Samples | Recommended |
|------|-------------|-------------|
| Fine-tune existing model | 200 lines | 1,000+ lines |
| Train from scratch | 5,000 lines | 50,000+ lines |

## Tips for Persian OCR

- Include diverse fonts: **Nastaliq**, **Naskh**, **Tahoma**, **IRANSans**
- Cover Persian-specific letters: گ چ پ ژ
- Include common Persian ligatures: لا, شده, های, باشد
- Mix printed and handwritten styles
- Vary image quality (blur, noise, skew) for robustness
