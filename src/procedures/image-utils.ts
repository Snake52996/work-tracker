import type { LoadedImage } from "./item-migrant";
import { ImageFormat, type ImageFormatSpecification } from "@/types/image-types";
import { Result } from "@/types/result";

const ImagePerRow = 8;
const ImageRows = 8;
const ThumbnailDownscale = 10;

const DefaultImageType = ImageFormat.WebP.mime;

export const ImagePoolConfiguration = {
  rows: ImagePerRow,
  columns: ImageRows,
};

function get_offset(
  index: number,
  image_size: { height: number; width: number },
): { sx: number; sy: number } {
  const sx = (index % ImagePerRow) * image_size.width;
  const sy = Math.floor(index / ImagePerRow) * image_size.height;
  return { sx, sy };
}

export function to_thumbnail_size(size: { height: number; width: number }): {
  height: number;
  width: number;
} {
  return {
    height: Math.floor(size.height / ThumbnailDownscale),
    width: Math.floor(size.width / ThumbnailDownscale),
  };
}

// get image in slot at specified index
export async function crop_image(
  image: Blob | ImageBitmap,
  index: number,
  image_size: { height: number; width: number },
): Promise<Result<string>> {
  const canvas = new OffscreenCanvas(image_size.width, image_size.height);
  const context = canvas.getContext("2d");
  if (context === null) {
    return Result.error("Failed to acquire content from canvas");
  }
  const { sx, sy } = get_offset(index, image_size);
  if (image instanceof Blob) {
    // create a cropped image directly
    const drawable_image = await window.createImageBitmap(image, sx, sy, image_size.width, image_size.height);
    context.drawImage(drawable_image, 0, 0);
    drawable_image.close();
  } else {
    context.drawImage(
      image,
      sx,
      sy,
      image_size.width,
      image_size.height,
      0,
      0,
      image_size.width,
      image_size.height,
    );
  }
  const blob = await canvas.convertToBlob({ type: DefaultImageType });
  return Result.ok(URL.createObjectURL(blob));
}

// load image from a Blob, resizing it into the shape of full item image and its thumbnail
//  returns Blob URL and the ImageBitmap for each component
export async function load_image(
  image: Blob | HTMLImageElement,
  image_size: { height: number; width: number },
  image_format: ImageFormatSpecification,
  thumbnail_format: ImageFormatSpecification,
): Promise<Result<LoadedImage>> {
  const canvas = new OffscreenCanvas(image_size.width, image_size.height);
  const context = canvas.getContext("2d");
  if (context === null) {
    return Result.error(
      "cannot open canvas to operate images",
      "cannot acquire 2d context from OffscreenCanvas instance",
    );
  }

  try {
    const drawable_image = await window.createImageBitmap(image);

    // create full image
    context.drawImage(drawable_image, 0, 0, image_size.width, image_size.height);
    const image_blob = await canvas.convertToBlob({ type: image_format.mime });
    const image_bitmap = canvas.transferToImageBitmap();
    const image_url = URL.createObjectURL(image_blob);

    // create thumbnail
    const thumbnail_size = to_thumbnail_size(image_size);
    canvas.height = thumbnail_size.height;
    canvas.width = thumbnail_size.width;
    context.drawImage(drawable_image, 0, 0, thumbnail_size.width, thumbnail_size.height);
    const thumbnail_blob = await canvas.convertToBlob({ type: thumbnail_format.mime });
    const thumbnail_bitmap = canvas.transferToImageBitmap();
    const thumbnail_url = URL.createObjectURL(thumbnail_blob);
    return Result.ok({
      thumbnail_url,
      thumbnail: thumbnail_bitmap,
      image_url,
      image: image_bitmap,
    });
  } catch (error) {
    return Result.error("cannot operate image", String(error));
  }
}

// create an empty image pool given the size of a single image in the pool
//  This function returns a ImageBitmap since a newly allocated pool will usually be filled with some image
//  immediately after the allocation
export function create_empty_pool(image_size: { height: number; width: number }): ImageBitmap {
  const canvas = new OffscreenCanvas(image_size.width * ImagePerRow, image_size.height * ImageRows);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw Error;
  }
  return canvas.transferToImageBitmap();
}

// place image to slot as specified index
//  the source image should be properly resized
export async function place_image(
  destination: Blob,
  index: number,
  source: ImageBitmap,
  image_size: { height: number; width: number },
  format: ImageFormatSpecification,
): Promise<Blob>;
export async function place_image(
  destination: ImageBitmap,
  index: number,
  source: ImageBitmap,
  image_size: { height: number; width: number },
): Promise<ImageBitmap>;
export async function place_image(
  destination: Blob | ImageBitmap,
  index: number,
  source: ImageBitmap,
  image_size: { height: number; width: number },
  format?: ImageFormatSpecification,
): Promise<Blob | ImageBitmap> {
  const destination_bitmap =
    destination instanceof Blob ? await window.createImageBitmap(destination) : destination;
  const canvas = new OffscreenCanvas(destination_bitmap.width, destination_bitmap.height);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw Error;
  }
  context.drawImage(destination_bitmap, 0, 0);
  destination_bitmap.close();
  const { sx, sy } = get_offset(index, image_size);
  context.drawImage(source, sx, sy);
  return destination instanceof Blob
    ? await canvas.convertToBlob({ type: format?.mime ?? DefaultImageType })
    : canvas.transferToImageBitmap();
}

// encode an image bitmap with certain codec
export async function encode_image(image: ImageBitmap, format: ImageFormatSpecification): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw Error;
  }
  context.drawImage(image, 0, 0);
  return await canvas.convertToBlob({ type: format.mime });
}
