import { test as base } from '@playwright/test';
import { SignInPage } from '../pages/auth/sign-in.page';
import { SignUpPage } from '../pages/auth/sign-up.page';
import { ShopPage } from '../pages/shop/shop.page';
import { ProductDetailPage } from '../pages/shop/product-detail.page';
import { CheckoutPage } from '../pages/checkout/checkout.page';
import { AccountPage } from '../pages/account/account.page';
import { AdminDashboardPage } from '../pages/admin/dashboard.page';
import { AdminProductsPage } from '../pages/admin/products.page';

type PageFixtures = {
  signInPage: SignInPage;
  signUpPage: SignUpPage;
  shopPage: ShopPage;
  productDetailPage: ProductDetailPage;
  checkoutPage: CheckoutPage;
  accountPage: AccountPage;
  adminDashboardPage: AdminDashboardPage;
  adminProductsPage: AdminProductsPage;
};

export const test = base.extend<PageFixtures>({
  signInPage: async ({ page }, provideFixture) => {
    await provideFixture(new SignInPage(page));
  },
  signUpPage: async ({ page }, provideFixture) => {
    await provideFixture(new SignUpPage(page));
  },
  shopPage: async ({ page }, provideFixture) => {
    await provideFixture(new ShopPage(page));
  },
  productDetailPage: async ({ page }, provideFixture) => {
    await provideFixture(new ProductDetailPage(page));
  },
  checkoutPage: async ({ page }, provideFixture) => {
    await provideFixture(new CheckoutPage(page));
  },
  accountPage: async ({ page }, provideFixture) => {
    await provideFixture(new AccountPage(page));
  },
  adminDashboardPage: async ({ page }, provideFixture) => {
    await provideFixture(new AdminDashboardPage(page));
  },
  adminProductsPage: async ({ page }, provideFixture) => {
    await provideFixture(new AdminProductsPage(page));
  },
});

export { expect } from '@playwright/test';
