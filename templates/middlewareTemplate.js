module.exports = (middlewareName) => `
module.exports = (req, res, next) => {
    // Implement your middleware logic for ${middlewareName}
    next();
};
`;
