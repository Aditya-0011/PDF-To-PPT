# %%
import keras_ocr
import cv2
import math
import numpy as np
from PIL import Image
import fitz
import io
import os
import sys
from pathlib import Path
from pptx import Presentation
from pptx.util import Pt, Emu
from pdf2docx import Converter
from cv2 import dnn_superres
# sr = dnn_superres.DnnSuperResImpl_create()
# sr.readModel("./EDSR_x3.pb")
# sr.setModel("edsr", 3)
def midpoint(x1, y1, x2, y2):
    x_mid = int((x1 + x2)/2)
    y_mid = int((y1 + y2)/2)
    return (x_mid, y_mid)
pipeline = keras_ocr.pipeline.Pipeline()

def inpaint_text(img, pipeline, type): 
    
    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
    elif img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype('uint8')
    try:
        prediction_groups = pipeline.recognize([img])
    except ValueError as e:
        print(f"Error occurred: {e}")
        return None
    mask = np.zeros(img.shape[:2], dtype="uint8")
    for box in prediction_groups[0]:
        x0, y0 = box[1][0]
        x1, y1 = box[1][1] 
        x2, y2 = box[1][2]
        x3, y3 = box[1][3] 
        
        x_mid0, y_mid0 = midpoint(x1, y1, x2, y2)
        x_mid1, y_mi1 = midpoint(x0, y0, x3, y3)
        
        thickness = int(math.sqrt( (x2 - x1)**2 + (y2 - y1)**2 ))
        
        cv2.line(mask, (x_mid0, y_mid0), (x_mid1, y_mi1), 255,    
        thickness)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_DILATE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        if cv2.contourArea(contour) > 10:  # Adjust this threshold as needed
            cv2.drawContours(mask, [contour], -1, (255), thickness=cv2.FILLED)
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    mask = cv2.filter2D(mask, -1, kernel)
    img = cv2.inpaint(img, mask, 3, cv2.INPAINT_NS)
    # result = sr.upsample(img)
    if type == "CMYK":
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    cv2.imwrite(f"{Path().absolute()}\\pptx\\{str(dir_name)}\\text_free_image.jpg",img)

dir_name = sys.argv[1]
pptx_dir_path = f'{Path().absolute()}\\pptx\\{str(dir_name)}' #images file here
img_path=f'{Path().absolute()}\\pptx\\{str(dir_name)}\\images'
file_path = f'{Path().absolute()}\\pdf\\{str(dir_name)}.pdf'

doc = fitz.open(file_path)
for page in doc:
    images = page.get_images()
    for item in images:
        xref = item[0]
        rect= page.get_image_rects(xref)[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image)
        type=image.mode
        imged=inpaint_text(image_array,pipeline,type)
        ra = page.add_redact_annot(rect)
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)
        page.insert_image(rect, filename=f"{Path().absolute()}\\pptx\\{str(dir_name)}\\text_free_image.jpg")


file_path_new = f'{Path().absolute()}\\pdf\\{str(dir_name)}_1.pdf'
doc.save(file_path_new)
doc.close()

os.remove(file_path)
os.rename(file_path_new, file_path)

if sys.argv[2] == "true":
    os.makedirs(img_path)
    doc = fitz.open(file_path)
    counter=1
    for page in doc:
          images = page.get_images()
          for item in images:
                xref = item[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image = Image.open(io.BytesIO(image_bytes))
                image.save(f'{img_path}/{str(dir_name)}_{str(counter)}.jpg')
                counter+=1

os.remove(f'{Path().absolute()}\\pptx\\{str(dir_name)}\\text_free_image.jpg')
# %%
