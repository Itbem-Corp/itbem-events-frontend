// utils/auth.ts
export const getAuthHeaders = () => {
    // Por ahora retorna el bypass, pero será fácil cambiar después
    return {
        'Authorization': '1' // TODO: Implementar auth real
    };
};

// En el futuro será algo como:
// return {
//     'Authorization': `Bearer ${getToken()}`
// };