var stream    = require('stream');
var util      = require('util');
var Tokenizer = require('./lib/Tokenizer');


function Stringify() {
  stream.Transform.call(this, { objectMode: true });
}
util.inherits(Stringify, stream.Transform);

Stringify.prototype._transform = function(chunk, encoding, done) {
//  this.push(">>" + JSON.stringify(chunk) + "<<\n");
//  this.push(chunk.content);
  done();
};
stringify = new Stringify();

// https://github.com/Floby/node-tokenizer
t = new Tokenizer();


t.addRule(Tokenizer.whitespace);
//t.addRule(Tokenizer.word);
t.addRule(/^h[1-6]\.$/, 'heading');
t.addRule(/^[-\w\d]+$/, 'word');
t.addRule(/^{[\w-]+(:.*)?}$/, 'macro');
t.addRule(/^{{[-\w\d=\/\\:. ]+}}$/, 'literal'); // spaces are allowed in literals


t.addRule(/^\*$/, 'star');
t.addRule(/^\_$/, 'under');
t.addRule(/^\#$/, 'hash');
t.addRule(/^\"$/, 'dquote');
t.addRule(/^\'$/, 'squote');
t.addRule(/^\{\s$/, 'ocurly');
t.addRule(/^\}$/, 'ccurly');
t.addRule(/^\[$/, 'obracket');
t.addRule(/^\]$/, 'cbracket');
t.addRule(/^[\(\)]$/, "parens");
t.addRule(/^[|]$/, 'pipe');
t.addRule(/^[@~;:\?\^%<>=!&+\-\$\\\/\.,]$/, "punct")



//t.ignore('whitespace');

t.on('token', function (token, type) {
               console.log('%s %s', token, type);
              // t.push(token)
              });

process.stdin.pipe(t)
             .pipe(stringify)
             .pipe(process.stdout)

