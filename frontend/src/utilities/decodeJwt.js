import jwt_decode from 'jwt-decode'

// Returns the signed-in user from the stored token, or undefined when there
// is no token. Expired or unreadable tokens are removed so the rest of the app
// treats the visitor as signed out instead of sending a token the backend rejects.
const getUserInfo = () => {
    const accessToken = localStorage.getItem("accessToken")
    if(!accessToken) return undefined
    try {
        const user = jwt_decode(accessToken)
        if (user.exp && user.exp * 1000 <= Date.now()) throw new Error('Token expired')
        return user
    } catch (error) {
        localStorage.removeItem("accessToken")
        return undefined
    }
}

export default getUserInfo
