const bcrypt = require('bcryptjs');
const { db, admin, firebaseError } = require('./firebase');
const FieldValue = admin.firestore.FieldValue;

if (!db) {
  console.error('Seed failed:', firebaseError ? firebaseError.message : 'Firebase not configured');
  process.exit(1);
}

const genres = [
  'Fiction', 'Non-Fiction', 'Mystery', 'Romance',
  'Science Fiction', 'Fantasy', 'Biography', 'History',
];

const books = [
  { book_id: 1, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', price: 10.99, genre: 'Fiction', featured: true, bestseller: true, stock: 25, publisher: 'Scribner', publishYear: 1925, isbn: '978-0743273565', description: 'A classic novel of the Jazz Age following the enigmatic Jay Gatsby and his obsession with the elusive Daisy Buchanan.', cover_image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 2, title: 'To Kill a Mockingbird', author: 'Harper Lee', price: 12.99, genre: 'Fiction', featured: true, bestseller: true, stock: 40, publisher: 'J. B. Lippincott', publishYear: 1960, isbn: '978-0061120084', description: 'A gripping tale of racial injustice and childhood innocence in the American South.', cover_image: 'https://images.unsplash.com/photo-1507842717343-583f20270319?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 3, title: '1984', author: 'George Orwell', price: 13.99, genre: 'Science Fiction', featured: true, bestseller: false, stock: 18, publisher: 'Secker & Warburg', publishYear: 1949, isbn: '978-0451524935', description: 'A dystopian vision of a totalitarian future ruled by surveillance and propaganda.', cover_image: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 4, title: 'Sapiens', author: 'Yuval Noah Harari', price: 18.99, genre: 'Non-Fiction', featured: false, bestseller: true, stock: 30, publisher: 'Harvill Secker', publishYear: 2011, isbn: '978-0062316097', description: 'A brief history of humankind, from the Stone Age to the modern age.', cover_image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 5, title: 'The Hobbit', author: 'J.R.R. Tolkien', price: 11.99, genre: 'Fantasy', featured: true, bestseller: false, stock: 0, publisher: 'George Allen & Unwin', publishYear: 1937, isbn: '978-0547928227', description: 'Bilbo Baggins embarks on an unexpected adventure across Middle-earth. (Currently out of stock.)', cover_image: 'https://images.unsplash.com/photo-1507842717343-583f20270319?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 6, title: 'Murder on the Orient Express', author: 'Agatha Christie', price: 9.99, genre: 'Mystery', featured: false, bestseller: true, stock: 22, publisher: 'Collins Crime Club', publishYear: 1934, isbn: '978-0062693662', description: 'Detective Hercule Poirot must solve a murder aboard a stranded train.', cover_image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 7, title: 'Pride and Prejudice', author: 'Jane Austen', price: 8.99, genre: 'Romance', featured: false, bestseller: false, stock: 35, publisher: 'T. Egerton', publishYear: 1813, isbn: '978-0141439518', description: 'A witty exploration of love, reputation and class in Georgian England.', cover_image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 8, title: 'Steve Jobs', author: 'Walter Isaacson', price: 16.99, genre: 'Biography', featured: true, bestseller: true, stock: 14, publisher: 'Simon & Schuster', publishYear: 2011, isbn: '978-1451648539', description: 'The definitive biography of Apple co-founder Steve Jobs.', cover_image: 'https://images.unsplash.com/photo-1507842717343-583f20270319?ixlib=rb-1.2.1&auto=format&fit=crop&w=400' },
  { book_id: 9, title: 'The Catcher in the Rye', author: 'J.D. Salinger', price: 11.99, genre: 'Fiction', featured: false, bestseller: true, stock: 28, publisher: 'Little, Brown', publishYear: 1951, isbn: '978-0316769488', description: 'A coming-of-age story of teenager Holden Caulfield in 1950s New York.' },
  { book_id: 10, title: 'The Alchemist', author: 'Paulo Coelho', price: 10.49, genre: 'Fiction', featured: true, bestseller: true, stock: 33, publisher: 'HarperOne', publishYear: 1988, isbn: '978-0061122415', description: 'A shepherd boy journeys to Egypt in search of a worldly treasure and self-discovery.' },
  { book_id: 11, title: 'Brave New World', author: 'Aldous Huxley', price: 12.49, genre: 'Fiction', featured: false, bestseller: false, stock: 19, publisher: 'Chatto & Windus', publishYear: 1932, isbn: '978-0060850524', description: 'A dystopian society engineered for stability through pleasure and control.' },
  { book_id: 12, title: 'Life of Pi', author: 'Yann Martel', price: 13.49, genre: 'Fiction', featured: true, bestseller: false, stock: 21, publisher: 'Knopf Canada', publishYear: 2001, isbn: '978-0156027328', description: 'A boy survives 227 days adrift in the Pacific with a Bengal tiger.' },
  { book_id: 13, title: 'The Kite Runner', author: 'Khaled Hosseini', price: 12.99, genre: 'Fiction', featured: true, bestseller: true, stock: 26, publisher: 'Riverhead', publishYear: 2003, isbn: '978-1594631931', description: 'A story of friendship, betrayal and redemption across Afghanistan and America.' },
  { book_id: 14, title: 'Educated', author: 'Tara Westover', price: 15.99, genre: 'Non-Fiction', featured: true, bestseller: true, stock: 24, publisher: 'Random House', publishYear: 2018, isbn: '978-0399590504', description: 'A memoir of a woman who leaves her survivalist family for formal education.' },
  { book_id: 15, title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', price: 19.99, genre: 'Non-Fiction', featured: false, bestseller: true, stock: 17, publisher: 'Farrar, Straus and Giroux', publishYear: 2011, isbn: '978-0374533557', description: 'A tour of the two systems that drive the way we think and decide.' },
  { book_id: 16, title: 'Becoming', author: 'Michelle Obama', price: 18.49, genre: 'Biography', featured: true, bestseller: true, stock: 22, publisher: 'Crown', publishYear: 2018, isbn: '978-1524763138', description: 'The intimate memoir of the former First Lady of the United States.' },
  { book_id: 17, title: 'The Body', author: 'Bill Bryson', price: 16.49, genre: 'Non-Fiction', featured: false, bestseller: false, stock: 20, publisher: 'Doubleday', publishYear: 2019, isbn: '978-0385539438', description: 'A fascinating tour of the human body and how it works.' },
  { book_id: 18, title: 'Atomic Habits', author: 'James Clear', price: 14.99, genre: 'Non-Fiction', featured: true, bestseller: true, stock: 40, publisher: 'Avery', publishYear: 2018, isbn: '978-0735211292', description: 'An easy and proven way to build good habits and break bad ones.' },
  { book_id: 19, title: 'The Girl with the Dragon Tattoo', author: 'Stieg Larsson', price: 11.49, genre: 'Mystery', featured: false, bestseller: true, stock: 23, publisher: 'Norstedts', publishYear: 2005, isbn: '978-0307454546', description: 'A journalist and a hacker investigate a decades-old disappearance.' },
  { book_id: 20, title: 'Gone Girl', author: 'Gillian Flynn', price: 12.49, genre: 'Mystery', featured: false, bestseller: true, stock: 18, publisher: 'Crown', publishYear: 2012, isbn: '978-0307588371', description: 'A marriage dissolves into a twisted game of deception and disappearance.' },
  { book_id: 21, title: 'The Da Vinci Code', author: 'Dan Brown', price: 10.99, genre: 'Mystery', featured: true, bestseller: true, stock: 31, publisher: 'Doubleday', publishYear: 2003, isbn: '978-0307474278', description: 'A symbologist unravels a conspiracy hidden within famous artworks.' },
  { book_id: 22, title: 'And Then There Were None', author: 'Agatha Christie', price: 9.49, genre: 'Mystery', featured: false, bestseller: false, stock: 27, publisher: 'Collins Crime Club', publishYear: 1939, isbn: '978-0062073482', description: 'Ten strangers are lured to an island and picked off one by one.' },
  { book_id: 23, title: 'The Notebook', author: 'Nicholas Sparks', price: 8.49, genre: 'Romance', featured: false, bestseller: true, stock: 34, publisher: 'Warner Books', publishYear: 1996, isbn: '978-0446676090', description: 'A tender love story spanning decades in a small coastal town.' },
  { book_id: 24, title: 'Me Before You', author: 'Jojo Moyes', price: 9.99, genre: 'Romance', featured: false, bestseller: true, stock: 29, publisher: 'Michael Joseph', publishYear: 2012, isbn: '978-0670026609', description: 'A young woman becomes caregiver to a paralyzed billionaire.' },
  { book_id: 25, title: 'Outlander', author: 'Diana Gabaldon', price: 13.99, genre: 'Romance', featured: true, bestseller: false, stock: 16, publisher: 'Delacorte', publishYear: 1991, isbn: '978-0440212560', description: 'A WWII nurse travels back in time to 18th-century Scotland.' },
  { book_id: 26, title: 'It Ends with Us', author: 'Colleen Hoover', price: 10.49, genre: 'Romance', featured: false, bestseller: true, stock: 38, publisher: 'Atria', publishYear: 2016, isbn: '978-1501110368', description: 'A young woman confronts the complexities of love and sacrifice.' },
  { book_id: 27, title: 'Dune', author: 'Frank Herbert', price: 17.99, genre: 'Science Fiction', featured: true, bestseller: true, stock: 25, publisher: 'Chilton Books', publishYear: 1965, isbn: '978-0441013593', description: 'On a desert planet, a young heir confronts destiny, politics and spice.' },
  { book_id: 28, title: 'The Martian', author: 'Andy Weir', price: 12.99, genre: 'Science Fiction', featured: false, bestseller: true, stock: 30, publisher: 'Crown', publishYear: 2011, isbn: '978-0553418026', description: 'An astronaut stranded on Mars must survive with wit and science.' },
  { book_id: 29, title: 'Neuromancer', author: 'William Gibson', price: 11.99, genre: 'Science Fiction', featured: false, bestseller: false, stock: 15, publisher: 'Ace', publishYear: 1984, isbn: '978-0441569595', description: 'A burned-out hacker is hired for one last job in cyberspace.' },
  { book_id: 30, title: 'Foundation', author: 'Isaac Asimov', price: 13.49, genre: 'Science Fiction', featured: true, bestseller: false, stock: 19, publisher: 'Gnome Press', publishYear: 1951, isbn: '978-0553293357', description: 'A mathematician foresees the fall of a galactic empire.' },
  { book_id: 31, title: 'Harry Potter and the Sorcerer\'s Stone', author: 'J.K. Rowling', price: 14.99, genre: 'Fantasy', featured: true, bestseller: true, stock: 45, publisher: 'Bloomsbury', publishYear: 1997, isbn: '978-0590353427', description: 'A young wizard discovers his heritage at Hogwarts School.' },
  { book_id: 32, title: 'A Game of Thrones', author: 'George R.R. Martin', price: 16.99, genre: 'Fantasy', featured: true, bestseller: true, stock: 32, publisher: 'Bantam Spectra', publishYear: 1996, isbn: '978-0553593716', description: 'Noble houses vie for a brutal throne in a land of ice and fire.' },
  { book_id: 33, title: 'The Name of the Wind', author: 'Patrick Rothfuss', price: 15.49, genre: 'Fantasy', featured: false, bestseller: false, stock: 14, publisher: 'DAW', publishYear: 2007, isbn: '978-0756404741', description: 'A legendary magician recounts the true story of his youth.' },
  { book_id: 34, title: 'Mistborn', author: 'Brandon Sanderson', price: 13.99, genre: 'Fantasy', featured: false, bestseller: true, stock: 21, publisher: 'Tor', publishYear: 2006, isbn: '978-0765311788', description: 'A thief joins a rebellion against a immortal tyrant in a ashfall city.' },
  { book_id: 35, title: 'Einstein: His Life and Universe', author: 'Walter Isaacson', price: 17.49, genre: 'Biography', featured: false, bestseller: false, stock: 13, publisher: 'Simon & Schuster', publishYear: 2007, isbn: '978-0743264747', description: 'The definitive biography of the revolutionary physicist.' },
  { book_id: 36, title: 'The Diary of a Young Girl', author: 'Anne Frank', price: 9.99, genre: 'Biography', featured: false, bestseller: true, stock: 26, publisher: 'Contact Publishing', publishYear: 1947, isbn: '978-0553296981', description: 'The poignant wartime writings of a Jewish girl in hiding.' },
  { book_id: 37, title: 'Guns, Germs, and Steel', author: 'Jared Diamond', price: 16.99, genre: 'History', featured: true, bestseller: true, stock: 18, publisher: 'W.W. Norton', publishYear: 1997, isbn: '978-0393317558', description: 'How geography and environment shaped human civilizations.' },
  { book_id: 38, title: 'The Silk Roads', author: 'Peter Frankopan', price: 18.99, genre: 'History', featured: false, bestseller: false, stock: 12, publisher: 'Bloomsbury', publishYear: 2015, isbn: '978-1101912376', description: 'A sweeping history of the world through its great trade routes.' },
];

const sampleReviews = [
  { bookId: 1, userName: 'Ayesha', rating: 5, comment: 'Beautifully written and timeless.' },
  { bookId: 1, userName: 'Rahim', rating: 4, comment: 'Great but a little melancholy.' },
  { bookId: 2, userName: 'Fatima', rating: 5, comment: 'A must-read for everyone.' },
];

async function seed() {
  const genreCount = (await db.collection('genres').get()).size;
  if (genreCount === 0) {
    for (const genre of genres) await db.collection('genres').add({ genre_name: genre });
  }

  for (const book of books) {
    const cover = `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`;
    const price = 200 + Math.floor(Math.random() * 401); // random BDT 200-600
    const ref = db.collection('books').doc(String(book.book_id));
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...book, price, cover_image: cover, images: [cover], rating: 0, ratingCount: 0 });
    } else {
      // Merge new schema fields (stock, description, etc.) without clobbering existing data.
      await ref.set({ ...book, price, cover_image: cover, images: [cover] }, { merge: true });
    }
  }

  for (const r of sampleReviews) {
    await db.collection('reviews').add({ ...r, userId: 'seed', createdAt: FieldValue.serverTimestamp() });
  }

  const adminEmail = 'admin@booknook.com';
  const existingAdmin = await db.collection('users').where('email', '==', adminEmail).limit(1).get();
  if (existingAdmin.empty) {
    await db.collection('users').add({
      full_name: 'Store Admin',
      email: adminEmail,
      password: await bcrypt.hash('admin123', 12),
      role: 'admin',
      addresses: [],
      wishlist: [],
      created_at: FieldValue.serverTimestamp(),
      last_login: null,
    });
    console.log('Created admin user: admin@booknook.com / admin123');
  }

  console.log(`Seeded ${genres.length} genres and ${books.length} books.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
