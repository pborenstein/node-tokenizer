var EventEmitter = require('events').EventEmitter;
var util = require('util');
var assert = require('assert');
var Transform = require('stream').Transform;
var disect = require('disect');

function noop(){}

function Tokenizer (check_token_cb, options) {
    if(!(this instanceof Tokenizer)) {
      return new Tokenizer(check_token_cb);
    }

    Transform.call(this, options);
    this._readableState.objectMode = true;
    this._buffered = ""; // we buffer untokenized data between writes
    this._regexes = []; // should contain objects
                        // with regex[RegExp] and type[String]
    this._ignored = {}; // a hash of ignored token types
                        // these will be parsed but not emitted
    this._checkToken = check_token_cb || noop;
}
util.inherits(Tokenizer, Transform);

Tokenizer.prototype._transform = function _transform(chunk, encoding, callback) {
  chunk = chunk.toString();
  var self = this;
  process.nextTick(function () {
    try {
      var index = 0, step = 64;
      while(index < chunk.length) {
        self._tokenize(chunk.substr(index, step));
        index += step;
      }
      callback();
    } catch(e) {
      callback(e);
    }
  })
};

Tokenizer.prototype._getMatchingRule = function _getMatchingRule(str) {
  for (var i = 0; i < this._regexes.length; ++i) {
      if(this._regexes[i].regex.test(str)) {
        return this._regexes[i];
      }
  }
  return null;
};

Tokenizer.prototype._tokenize = function _tokenize(data, nobuffer) {
    var r = -1;
    var regexes = this._regexes;
    // in case we buffered data on previous writes
    data = this._buffered + data;
    this._buffered = '';
    if(!data.length) {
      return;
    }

    var self = this;
    var maxIndex = disect(0, data.length, function (index) {
      var buf = data.substring(0, index + 1);
      return self._getMatchingRule(buf) === null;
    });

    if(maxIndex === 0) {
      // disect is fine if the RE that describes
      //  the token also describes a subset of the token
      //  But maybe there's a trailing literal?
      //  Then disect's strategy of trying shorter and shorter
      //  substrings if there isn't a match will fail.
      //  So let's take a brute force approach and keep
      //  going forward until we find a matching token.
      //  Of course, we could end up going to the end
      //  of what might be a very large text.

      for (i = 0, r = -1; i < data.length+1; i++) {
        if (self._getMatchingRule(data.substring(0,i))) {
          r = i;
          break;
        }
      }
      if (r > 0) {
        maxIndex = r;
      }

      if (r === 0) {
        throw new Error('r is 0?');
      }

      if (r < 0) {
        // We've tried matching what we have so far
        // but maybe we just haven't seen the end
        // of the token yet.

         maxIndex = data.length;
      }

    }

        // no token should be more that 128 chars
        //  of course someone will have a legitimate reason.
        //  turns out link tokens can be pretty long
    if(maxIndex === 0 || maxIndex > 1024) {
      // no match found
      throw new SyntaxError('could not tokenize ' + JSON.stringify(data));
    }
    else if (maxIndex === data.length && !nobuffer) {
      // the whole string is matching
      this._buffered = data;
      return;
    }
    else {
      // some substring is matching
      var str = data.substring(0, maxIndex);
      var rule = this._getMatchingRule(str);
      if(!rule) {
        throw new Error('wut? ' + JSON.stringify(data));
      }
      this._gotToken(str, rule);
      this._tokenize(data.substring(maxIndex), nobuffer);
    }
};

Tokenizer.prototype._flush = function _flush(callback) {
  var self = this;
  process.nextTick(function () {
    try {
      self._tokenize('', true);
      callback();
    } catch(e) {
      callback(e);
    }
  });
};

var Token = function String (content, type) {
  this.content = content;
  this.type = type;
  this.toString = function () {
    return this.content.toString();
  }
}
util.inherits(Token, String);
Token.prototype.valueOf = function valueOf() {
  return this.content;
};

Tokenizer.prototype._gotToken = function _gotToken(str, rule) {
    // notify the token checker
    var type = this._checkToken(str, rule) || rule.type;
    if(this._ignored[type]) return;
    var token = new Token(str, type);

    this.push(token);

    this.emit('token', token, type);
};

Tokenizer.prototype.addRule = function addRule(regex, type) {
    // this is useful for built-in rules
    if(!type) {
      if(Array.isArray(regex)) {
        return this.addRule(regex[0], regex[1]);
      }
      else if(regex) {
        return this.addRule(Tokenizer[regex]);
      }
      else {
        throw new Error('No parameters specified');
      }
    }
    assert.ok((regex instanceof RegExp) || (typeof regex === 'function'));
    assert.equal(typeof type, 'string');
    this._regexes.push({regex:regex,type:type});
};

/**
 * set some tokens to be ignored. these won't be emitted
 */
Tokenizer.prototype.ignore = function ignore(ignored) {
    if(Array.isArray(ignored)) {
        for (var i = 0; i < ignored.length; ++i) {
            this.ignore(ignored[i]);
        }
        return;
    }
    this._ignored[ignored] = true;
};

module.exports = Tokenizer;

// built-in rules
Tokenizer.whitespace    = [/^(\s)+$/, 'whitespace'];
Tokenizer.word          = [/^\w+$/, 'word'];
Tokenizer.number        = [/^\d+(\.\d+)?$/, 'number'];
