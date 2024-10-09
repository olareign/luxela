import { UserRepo } from "../../Database/repo/user.repo"
import {v2 as cloudinary} from 'cloudinary'
import sendEmail from "../../utils/email.utils";
import { signToken } from "../../utils/jwt.utils";
import BadRequestAPIError from "../../errors/BadrequestError";
import CustomAPIError from "../../errors/CustomAPIError";
import { StatusCodes } from "http-status-codes";
// import { buffer } from './../../../node_modules/rxjs/dist/esm5/internal/operators/buffer';
import {IBuyer, ISeller, UserRole}  from '../types/constant.types'
import NotFoundAPIError from "../../errors/NotFoundError";
// import NotFoundAPIError from "../../errors/NotFoundError";

/**
 * @class Userservice 
 * @classdesc handles all the user logic and relate directly with the user repository
 * @public signup
 * @public verifyUser
 * @public upload
 * @private the user repository
*/
export class UserService {
    /**
     * @private repository - the user repo containing CRUD logic to relate to the database
    */
    private repository: UserRepo;
    constructor(){
        this.repository = new UserRepo();
    }
    
    /**
     * @public 
     * @requires role the role values is required in directing the signing up logic to the right function 
     * @description the logic for signing up user based on role
     * @param data is an object of username, email, and picture as type string
     * @returns this return the actual user details with the otp sent to the user email for further verification
     * @returns this fuction also return the user details with token if the user is an already register user as the design for login is not available
     * @throws error 500
    */
    public async signup(data: {username: string, email: string, picture: string, role: string}) {
        try {
            const {role} = data;
            if(role === UserRole.SELLER){
                return await this.signupSeller(data)
            } else if(role === UserRole.BUYER) {
                return await this.signupBuyer(data)
            } else{
                throw new BadRequestAPIError('Kindly specify the user role!')
            }
        } catch (error: Error | any) {
            console.log(error.message)
            throw error
        }
    }


    /**
     * @public 
     * @description the logic for signing up user as a buyer || business
     * @param data is an object of IBuyer that contain the uer business account details
     * @returns this return the user details with the otp sent to the user email for further verification
     * @returns this fuction also return the user details with token if the user is an already register user as the design for login is not available
     * @throws error 500
    */
    public async signupSeller(data: Partial<ISeller>) {
        try {
            const token = signToken(data)
            const isExist = await this.repository.checkExist(data.email)
            if(isExist) {
             throw new BadRequestAPIError('User Account already exist!')
            }
            const saveData = await this.repository.createSeller(data)
            return {saveData, token}
        } catch (error: Error | any) {
            throw error
        }
    }


    /**
     * @public 
     * @description the logic for signing up user as a seller
     * @param data is an object of username, email, and picture as type string
     * @returns this return the user details with the otp sent to the user email for further verification
     * @returns this fuction also return the user details with token if the user is an already register user as the design for login is not available
     * @throws error 500
    */
    private async signupBuyer(data: {username: string, email: string, picture: string, role: string}) {
        try {
            const {username, email} = data;
            const token = signToken(data)
            const isExist = await this.repository.checkExist(email)
            if(isExist) {
                const saveData = await this.repository.getUserByMail(email)
                return {saveData, token}
            }
            const code = Math.floor(1000000 + Math.random() * 999999).toString();
            const credential = {
                ...data, 
                otpCode: {
                    code, 
                    exp: new Date(Date.now() + 10 * 60 * 1000)
                }
            }
            const saveData = await this.repository.createBuyer(credential)
            const mailPayload = {
                emailTo: email,
                subject: 'SECURITY OTP',
                htmlContent: {
                    code, 
                    username
                }
            }
            await sendEmail(mailPayload)
            return saveData
        } catch (error: Error | any) {
            console.log(error.message)
            throw error
        }
    }

    
    /**
     * @public 
     * @description the logic for user verification 
     * @param email to confirm user data
     * @param code to verify the user account
     * @returns this function returns the user data with the token.
    */
    public async verifyUser(email:string, code: string) {
        const otp = code.trim()
        try{
            const data: any = await this.repository.getUserByMail(email)
            if(data?.otpCode?.code !== otp) throw new CustomAPIError('Invalid OTP code!', StatusCodes.BAD_REQUEST)
            const currentTime = new Date()
            const expiryTime = new Date(data?.otpCode?.exp) 
            if(currentTime < expiryTime) {
                const newCode = Math.floor(1000000 + Math.random() * 999999).toString();
                await this.repository.update(data.id, { 
                    otpCode: {
                        code:newCode, 
                        exp: currentTime
                    }})
                const mailPayload = {
                    emailTo: email,
                    subject: 'NEW SECURITY OTP',
                    htmlContent: {code: newCode, username: data?.username as string}
                }
                await sendEmail(mailPayload)
                throw new CustomAPIError('OTP code expired, check your mail for a new code and retry!', StatusCodes.BAD_REQUEST)
            }
            await this.repository.update(data.id, {isVerified: true, otpCode: ''})
            const userData = {
                id: data?.id,
                userId: data?.userId,
                email: data?.email,
                username: data?.username,
                picture: data?.picture,
                isVerified: true
            }
            const token = signToken(userData)
            return {userData, token}
        }catch(error){
         
            throw error
        }
    }
    
    /**
     * @public 
     * @description this logic is used for file upload using cloudinary as the hosting service
     * @param file the image data in buffer format
     * @param folder the folder name to save the user image in
     * @param filename the name to be attached to the file 
     * @return this function returns a secure url for the image
    */
    public async upload(
        file: Buffer,
        filename: string,
        folder: string
    ){
        try{
            const base64 = file.toString("base64")
            const url = await cloudinary.uploader.upload(`data:image/png;base64,${base64}`, {
                public_id: filename,
                folder,
                overwrite: true,
            });
            return url;
        } catch (error) {
            throw error;
        }
    };

    /**
     * @description this function takes the userId too fetch for user data
     * @param userId the user data id
     * @returns user data
     * 
    */
    public async signIn(email: string){
        const isExist = await this.repository.checkExist(email)
        console.log(isExist)
        if(!isExist) {
            throw new NotFoundAPIError('User not register!')
        }
        const userData = await this.repository.getUserByMail(email)
        const {username} = userData;
        const token = signToken(userData)
        const code = Math.floor(1000000 + Math.random() * 999999).toString();
        const credential = {
            otpCode: {
                code, 
                exp: new Date(Date.now() + 10 * 60 * 1000)
            }
        }
        const mailPayload = {
            emailTo: email,
            subject: 'SECURITY OTP',
            htmlContent: {
                code, 
                username
            }
        }
        await sendEmail(mailPayload)
        await this.update(userData.id, credential)
        return {...userData, token};
    }
    
    /**
     * @description the logic for updating the user data
     * @param userId a string to fetch for user data
     * @param payload an object conataing data to update
    */
    public async update(userId: string, payload: object){
        const result = await this.repository.update(userId, payload)
        return result;
    }
    
    /**
     * @deprecated not currently in used in this application
    */
    public async delete(userId: string){
        const result = await this.repository.delete(userId)
        return result;
    }

    
}
