import { NextFunction, Request, Response } from "express";

const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  let statusCode = error.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let errorMessage = error.message || 'Internal Server Error';

  if (Array.isArray(error.errors)) {
    const formattedErrors = error.errors.map((err: any) => err.message);
    errorMessage += `: ${formattedErrors.join(', ')}`;
  }

  return res.status(statusCode).json({
    status: false,
    error: errorMessage
  });
};

export default errorHandler;

