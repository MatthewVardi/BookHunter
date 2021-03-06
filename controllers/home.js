const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/user');
const Book = require('../models/book');
const books = require('google-books-search');
const option = require('../config/bookAPI');
const nodemailer = require('nodemailer');
const async = require('async');
const crypto = require('crypto');

// create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 465,
		secure: true,
		auth: {
				user: process.env.GMAIL_USER,
				pass: process.env.GMAIL_PASS
		}
});

function isLoggedIn(req, res, next) {
	if(!req.isAuthenticated()) {
		req.flash("error", "You must be logged in to do that.");
		res.redirect("/login");
	}
	else{
		next();
	}
}

function isVerified(req, res, next) {
	if(!req.user.verified) {
		req.logout();
		req.flash("warning", "Please check your email to verify your account before logging in.");
		res.redirect("/login");
	} else {
		next();
	}
}

function usernameToLowerCase(req, res, next){
  req.body.username = req.body.username.toLowerCase();
  next();
}


// Define a route to the root of the application.
router.get('/', (req, res) => {
  res.render('home', {currentUser: req.user});
});


// Sign up routes
router.get('/signup', (req, res) => {
  res.render('signup');
});

router.post('/signup', usernameToLowerCase, (req, res) => {
	var newUser = new User(
	{
		verified: false,
		first: req.body.first_name,
		last: req.body.last_name,
		username: req.body.username,
		library: [],
  	wishlist: []

	});
	// Confirm new user's email address to avoid spam registration
	var mailOptions,host,link,email;
	User.register(newUser, req.body.password, function(err, user) {
		if(err) {
			// req.flash("error", err);
			req.flash("error", "A user with that email already exists.");
			res.redirect('signup');
		} else {
			// A verification link is emailed to user
			host = req.get('host');

			// User ID is the database id
			var userID = user.id;

			// host = "localhost:3000";

			link ="http://"+host+"/verify/"+userID;

			// setup email data
			email = {
				to : req.body.username,
				subject : "Bookhunter: Please confirm your Email account",
				html : "Hello,<br> Please Click on the link to verify your email for Bookhunter account.<br><a href="+link+">Click here to verify</a>"
			};
			// send mail with defined transport object
			transporter.sendMail(email, (error, info) => {
					if (error) {
							return console.log(error);
					}
					console.log('Message sent: %s', info.messageId);
			});
			req.flash("warning", "Please check your email to verify your account.")
			res.redirect('login');
		}
	});
});

router.get('/verify/:id', (req, res) => {
	// Search database for user by the id
	User.findById(req.params.id, function(err, foundUser){
		if (err) {
			req.flash("error", JSON.stringify(err));
			res.redirect('login');
		} else {
			//if user exists, set their verified value to true
			passport.authenticate('local');
			foundUser.verified = true;
			foundUser.save();
			req.flash("success", "Email verification successful.")
			res.redirect('/login');
		}
	});
});


// Log in routes
router.get('/login', (req, res) => {
  res.render('login');
});


router.post('/login', usernameToLowerCase, passport.authenticate('local',
	{
		successRedirect: '/profile',
		failureRedirect: 'login',
		failureFlash: true
	}), (req, res) => {

});


// Log out route
router.get("/logout", function(req, res) {
	req.logout();
	req.flash("success", "Successfully logged out.");
	res.redirect("/login");
});

// All Books route
router.get('/allbooks', isLoggedIn, isVerified, (req, res) => {
	Book.find({inLibrary: true}, function(err, librarybooks){
		if(err){
			console.log(err);
		} else {
			res.render("allbooks", {currentUser: req.user, libraryBooks: librarybooks});
		}
	});
});

// Help Page route
router.get('/help', (req, res) => {
  res.render('help', {currentUser: req.user});
});

// Contact form submission route
router.post('/send', (req, res) => {
  const output = `
		<p>You have a new contact request:</p>
		<h3>Contact Details</h3>
		<ul>
			<li>Name: ${req.body.contact_name}</li>
			<li>Email: ${req.body.contact_email}</li>
			<li>Subject: ${req.body.contact_subject}</li>
		</ul>
		<h3>Message</h3>
		<p>${req.body.contact_message}</p>
	`;

  // setup email data with unicode symbols
  let mailOptions = {
      from: '"Nodemailer Contact" <test@bookhunter.com', // sender address
      to: 'bookhunter.huntercollege@gmail.com', // list of receivers
      subject: 'New message from contact form at BookHunter.com',
      text: "Hello Boookhunter!",
			html: output
  };

  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          return console.log(error);
      }
      console.log('Message sent: %s', info.messageId);
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

		// rerender our home page with message
		res.render('home', {msg: "Thank you! Email has been sent."});
  });

});

// Testing profile page
router.get('/profile', isLoggedIn, isVerified, (req, res) => {
	Book.find( {"book_owner.id": req.user.id, inLibrary: true}, function(err, librarybooks){
		if(err) {
			console.log(err);
		} else {
			Book.find( {"book_owner.id": req.user.id, inWishlist: true}, function(err, wishlistbooks){
				if(err) {
					console.log(err);
				} else {
					res.render("profile", {
						librarybooks: librarybooks,
						wishlistbooks: wishlistbooks,
						currentUser: req.user
					});
				}
			});
		}
	});
});

router.get('/user/:id', isLoggedIn, isVerified, (req,res) => {
	User.findById(req.params.id, function(err, foundUser) {
		if(err) {
			console.log(err);
		} else {
			Book.find( {"book_owner.id": req.params.id, inLibrary: true}, function(err, librarybooks){
				if(err) {
					console.log(err);
				} else {
					Book.find( {"book_owner.id": req.params.id, inWishlist: true}, function(err,wishlistbooks){
						if(err) {
							console.log(err);
						} else {
							res.render("user", {
								foundUser: foundUser,
								librarybooks: librarybooks,
								wishlistbooks: wishlistbooks,
								currentUser: req.user
							});
						}
					});
				}
			});
		}
	});
});

//Change Profile Setting
router.get('/settings', isLoggedIn, isVerified, (req, res) => {
	User.find({}, function(err, allUsers) {
		if(err) {
			console.log(err);
		} else {
			res.render('settings', {users: allUsers, currentUser: req.user});
		}
	});
});

//Update Profile Setting
router.post('/settings/:id', isLoggedIn, isVerified, (req, res) => {
  var id = req.params.id;
	console.log(id);

  var newFirstName = req.body.firstName;
  var newLastName = req.body.lastName;

  User.findByIdAndUpdate(id, {
    first : newFirstName,
    last: newLastName ,
  }, {
    new: true
  },function(err, user){
    if(err){
      res.flash('settingMessage', 'There is an error. Please check your input or try again later!');
      res.redirect('/');
    }
    res.redirect('/profile');
  })
});

// FORGOT PASSWORD ROUTE
router.get('/forgot', (req, res) =>  {
  res.render('forgot');
});

router.post('/forgot', function(req, res, next) {
  async.waterfall([
    function(done) {
      crypto.randomBytes(20, function(err, buf) {
        var token = buf.toString('hex');
        done(err, token);
      });
    },
    function(token, done) {
      User.findOne({ username: req.body.email }, function(err, user) {
        if (!user) {
          req.flash('error', 'No account with that email address exists.');
          return res.redirect('/forgot');
        }
				else {
					user.resetPasswordToken = token;
					user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

					user.save(function(err) {
						done(err, token, user);
					});
				}

      });
    },
    function(token, user, done) {

      var mailOptions = {
        to: user.username,
        from: 'bookhunter.huntercollege@gmail.com',
        subject: 'BookHunter Password Reset',
        text: 'You have requested the reset of the password for your account.\n\n' +
          'Please click on the following link to complete the process:\n\n' +
          'http://' + req.headers.host + '/reset/' + token + '\n\n' +
          'If you did not request this, please ignore this email and your password will remain unchanged.\n'
      };
      transporter.sendMail(mailOptions, function(err) {
        console.log('Reset password email was sent');
        req.flash('success', 'An e-mail has been sent to ' + user.username + ' with further instructions.');
        done(err, 'done');
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/forgot');
  });
});


// RESET PASSWORD ROUTE
router.get('/reset/:token', (req, res) => {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if (!user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot');
    }
		else {
    	res.render('reset', {token: req.params.token});
		}
  });
});

router.post('/reset/:token', (req, res) => {
  async.waterfall([
    function(done) {
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
        if (!user) {
          req.flash('error', 'Password reset token is invalid or has expired.');
          return res.redirect('/forgot');
        }
        if(req.body.password === req.body.confirm) {
          user.setPassword(req.body.password, function(err) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            user.save(function(err) {
              req.logIn(user, function(err) {
                done(err, user);
              });
            });
          })
        } else {
            req.flash("error", "Passwords do not match.");
            return res.redirect('back');
        }
      });
    },
    function(user, done) {

      var mailOptions = {
        to: user.username,
        from: 'bookhunter.huntercollege@gmail.com',
        subject: 'Your BookHunter password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + user.username + ' has just been changed.\n'
      };
      transporter.sendMail(mailOptions, function(err) {
        req.flash('success', 'Success! Your password has been changed.');
        done(err);
      });
    }
  ], function(err) {
    res.redirect('/profile');
  });
});

// SEARCH ROUTE FOR BOOKS TO ADD THEM TO THE LIBRARY
router.get('/search', isLoggedIn, isVerified, (req, res) => {
  var title = req.query.title;
  // console.log(title);
  books.search(title, option, function(error, results, apiResponse){
    if(!error){
			//console.log(results);
      res.render('search', {
				currentUser: req.user,
        title: req.query.title,
        books: results
      })
    } else {
      //console.log(error);
      res.status(404).send('File Not Found!');
    }
  })
});

//ADD A BOOK TO USER'S LIBRARY
router.post('/toLibrary',isLoggedIn, isVerified, function(req,res){
	var newBook = new Book({
		book_id: req.body.book_id,
		book_title: req.body.book_title,
		book_author: req.body.book_author,
		book_link: req.body.book_link,
		book_publisher: req.body.book_publisher,
	  book_thumbnail: req.body.book_thumbnail,
		book_owner: {id: req.user._id, username: req.user.username},
		inWishlist: false,
		inLibrary: true
	});

	newBook.save(function(err){
		if(err){
			console.log(err);
		}
		User.findById(req.user._id, function(err, foundUser){
			if(err){
				console.log(err);
				return;
			}
			foundUser.library.push(newBook);
			foundUser.save(function(err){
				if(err){
					console.log(err);
					return;
				}
				res.redirect('/profile');
			})
		})
	})
});

//ADD A BOOK TO USER'S WISHLIST
router.post('/toWishlist', isLoggedIn, isVerified, function(req,res){
	var newBook = new Book({
		book_id: req.body.book_id,
		book_title: req.body.book_title,
		book_author: req.body.book_author,
		book_link: req.body.book_link,
		book_publisher: req.body.book_publisher,
		book_thumbnail: req.body.book_thumbnail,
		book_owner: {id: req.user._id, username: req.user.username},
		inWishlist: true,
		inLibrary: false
	});

	newBook.save(function(err){
		if(err){
			console.log(err);
		}
		User.findById(req.user._id, function(err, foundUser){
			if(err){
				console.log(err);
				return;
			}
			foundUser.wishlist.push(newBook);
			foundUser.save(function(err){
				if(err){
					console.log(err);
					return;
				}
				res.redirect('/profile');
			})
		})
	})
});

//REMOVE A BOOK FROM USER'S LIBRARY
router.post('/removeFromLibrary/:bookID', isLoggedIn, isVerified, function(req, res){

 var book_id = req.params.bookID;
 //console.log(book_id);

 User.findById(req.user._id, function(err, user){
	 if(err){
		 console.log(err);
		 return;
	 }
	 //console.log(user);
	 // Search book in user's library  by book_id and remove
	 var bookIndex = user.library.indexOf(book_id);
	 user.library.splice(bookIndex, 1);
	 user.save(function(err){
		 if(err){
			 console.log(err);
			 return;
		 }
		 Book.findByIdAndRemove(book_id, function(err, book){
			 if(err){
				 console.log(err);
				 return;
			 }
			 //console.log(user);
			 res.redirect('/profile');
		 })
	 })
 })
});

//REMOVE A BOOK FROM USER'S WISHLIST
router.post('/removeFromWishlist/:bookID', isLoggedIn, isVerified, function(req, res){

 var book_id = req.params.bookID;
 console.log(book_id);

 User.findById(req.user._id, function(err, user){
	 if(err){
		 console.log(err);
		 return;
	 }
	 console.log(user);
	 // Search book in user's wishlist by book_id and remove
	 var bookIndex = user.wishlist.indexOf(book_id);
	 user.wishlist.splice(bookIndex, 1);
	 user.save(function(err){
		 if(err){
			 console.log(err);
			 return;
		 }
		 Book.findByIdAndRemove(book_id, function(err, book){
			 if(err){
				 console.log(err);
				 return;
			 }
			 console.log(user);
			 res.redirect('/profile');
		 })
	 })
 })
});


module.exports = router;
