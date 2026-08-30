import { BadRequestException } from "@nestjs/common";
// import { v4 as uuidv4 } from 'uuid';
import { extname } from "path";
import { UploadFileDto } from "../../file/dto/upload.file.dto";

export const imageFileFilter = (req, file, callback) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|jfif)$/)) {
    //  return new HttpException('file format should be one of these: jpg|jpeg|png|gif ',401)
    // return callback(new Error('Only image files are allowed!'), false);
    callback(new BadRequestException("FILE.INVALID"), false);
  }
  callback(null, true);
};

export const checkImageFile = (fnam: string) => {
  if (!fnam.match(/\.(jpg|jpeg|png|gif|jfif|pdf)$/)) {
    throw new BadRequestException("FILE.INVALID");
  }
  return true;
};

export const editFileName = (req, file, callback) => {
  const name = file.originalname.split(".")[0];
  const fileExtName = extname(file.originalname);
  const randomName = Array(4)
    .fill(null)
    .map(() => Math.round(Math.random() * 16).toString(16))
    .join("");
  callback(null, `${"edited"}-${randomName}${fileExtName}`);
  // callback(null, `${name}${fileExtName}`);
};

export const editUUIDFileName = (req, file, callback) => {
  const { FileTarget } = req.body as UploadFileDto;
  const fileExtName = extname(file.originalname);
  const uniqueId = crypto.randomUUID();
  const now = new Date().getTime();
  callback(null, `${FileTarget}-${now}-${uniqueId}${fileExtName}`);
};

export const multerOptions = {
  fileFilter: imageFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
};
