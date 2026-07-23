import os
from PIL import Image

src = r"C:\Users\soroe\Documents\A-App\data\image\IMAGE ENGINE CONVERTER.png"
out_dir = r"C:\Users\soroe\Documents\A-App\SOLID-IMAGE-ENGINE-CONVERTER\public\icons"
os.makedirs(out_dir, exist_ok=True)

img = Image.open(src)
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save(os.path.join(out_dir, "icon-192x192.png"))

img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(out_dir, "icon-512x512.png"))

img_favicon = img.resize((64, 64), Image.Resampling.LANCZOS)
img_favicon.save(r"C:\Users\soroe\Documents\A-App\SOLID-IMAGE-ENGINE-CONVERTER\public\favicon.ico", format="ICO")
print("Icons generated.")
