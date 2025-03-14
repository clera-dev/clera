// A simple implementation of the _extends helper with ES modules export 
export default function _extends() {
  _extends = Object.assign ? Object.assign.bind() : function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}

// Also add CommonJS exports for compatibility
if (typeof module !== 'undefined') {
  module.exports = _extends;
  module.exports.default = _extends;
} 