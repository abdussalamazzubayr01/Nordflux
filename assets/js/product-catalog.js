(function () {
  var catalog = {
    'nordluxe-long-white': {
      id: 'nordluxe-long-white',
      title: 'Nordluxe Long Ascension White',
      category: 'Longs',
      categoryLabel: 'Nordluxe Ascensions',
      originalPrice: '₦120,000',
      preorderPrice: '₦100,000',
      price: '₦100,000',
      keywords: [
        'long',
        'ascension',
        'white',
        'tailored fit',
        'premium ceremonial fabric',
        'royal silhouette'
      ],
      image: '/assets/images/BRAND%20FACE%201.jpg',
      url: '/html/product.html?id=nordluxe-long-white'
    },
    'nordluxe-long-black': {
      id: 'nordluxe-long-black',
      title: 'Nordluxe Long Ascension Black',
      category: 'Longs',
      categoryLabel: 'Nordluxe Ascensions',
      originalPrice: '₦120,000',
      preorderPrice: '₦100,000',
      price: '₦100,000',
      keywords: [
        'long',
        'ascension',
        'black',
        'tailored fit',
        'premium ceremonial fabric',
        'dramatic profile'
      ],
      image: '/assets/images/NORDLUXE%20ANCENSION%20BLACK.jpg',
      url: '/html/product.html?id=nordluxe-long-black'
    },
    'cloak-white': {
      id: 'cloak-white',
      title: 'Cloak White',
      category: 'Cloaks',
      categoryLabel: 'Cloaks',
      originalPrice: '₦140,000',
      preorderPrice: '₦110,000',
      price: '₦110,000',
      keywords: [
        'cloak',
        'white',
        'flowing drape',
        'ornamental details',
        'ceremonial luxury',
        'statement piece'
      ],
      image: '/assets/images/WHITE%20CLOAK.jpg',
      url: '/html/product.html?id=cloak-white'
    },
    'cloak-black': {
      id: 'cloak-black',
      title: 'Cloak Black',
      category: 'Cloaks',
      categoryLabel: 'Cloaks',
      originalPrice: '₦140,000',
      preorderPrice: '₦110,000',
      price: '₦110,000',
      keywords: [
        'cloak',
        'black',
        'dramatic movement',
        'ornamental details',
        'ceremonial luxury',
        'statement piece'
      ],
      image: '/assets/images/NORDLUXE%20BLACK%20CLOAK.jpg',
      url: '/html/product.html?id=cloak-black'
    },
    'nordluxe-full-white-bundle': {
      id: 'nordluxe-full-white-bundle',
      title: 'Nordluxe Full Ascension White Bundle',
      category: 'Bundles',
      categoryLabel: 'Bundle Collections',
      originalPrice: '₦260,000',
      preorderPrice: '₦200,000',
      price: '₦200,000',
      keywords: [
        'bundle',
        'white',
        'full ascension',
        'includes long + cloak',
        'two-piece bundle',
        'value package'
      ],
      image: '/assets/images/NORDLUXE%20ANCENSION%20WHITE.jpg',
      url: '/html/product.html?id=nordluxe-full-white-bundle'
    },
    'nordluxe-full-black-bundle': {
      id: 'nordluxe-full-black-bundle',
      title: 'Nordluxe Full Ascension Black Bundle',
      category: 'Bundles',
      categoryLabel: 'Bundle Collections',
      originalPrice: '₦260,000',
      preorderPrice: '₦200,000',
      price: '₦200,000',
      keywords: [
        'bundle',
        'black',
        'full ascension',
        'includes long + cloak',
        'two-piece bundle',
        'value package'
      ],
      image: '/assets/images/NORDLUXE%20BLACK%20CLOAK%202.jpg',
      url: '/html/product.html?id=nordluxe-full-black-bundle'
    },
    'full-package': {
      id: 'full-package',
      title: 'Full Package (White + Black) Complete Collection',
      category: 'Bundles',
      categoryLabel: 'Bundle Collections',
      originalPrice: '₦580,000',
      preorderPrice: '₦410,000',
      price: '₦410,000',
      keywords: [
        'full package',
        'white + black',
        'complete collection',
        'all 6 pieces',
        'best value',
        'wardrobe package'
      ],
      image: '/assets/images/NORDLUXE%20MAIN%20PICTURE.jpg',
      url: '/html/product.html?id=full-package'
    }
  };

  if (!window.NORDLUXE_PRODUCT_CATALOG) {
    window.NORDLUXE_PRODUCT_CATALOG = catalog;
  }
})();
