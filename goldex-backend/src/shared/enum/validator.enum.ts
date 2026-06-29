export enum ValidatorEnum {
  PASSWORD = `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$`,
  /*
  Example Matches:
      Password1! ✅
      P@ssw0rd ✅
      WeakPass ❌ (No special character)
      short1! ❌ (Less than 8 characters)
  */
  EMAIL = `^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$`,
}
