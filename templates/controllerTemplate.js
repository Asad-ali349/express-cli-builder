module.exports = (controllerName,fileExtension) => `
// import ${controllerName}Model from '../models/${controllerName}.model.${fileExtension}';
${fileExtension === 'ts'? 'import { Request, Response } from "express";':''}

export const getAll = async (${fileExtension === 'ts'? 'req:Request, res:Response':'req, res'}) => {
    // Implement your logic to get all ${controllerName}s
    // return res.status(200).json({message:'OK'})

};

export const create = async (${fileExtension === 'ts'? 'req:Request, res:Response':'req, res'}) => {
    // Implement your logic to create a new ${controllerName}
};
`;
