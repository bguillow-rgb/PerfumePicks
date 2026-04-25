import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { Alert } from '@/src/components/ui/StyledAlert';
import type { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import {
  initRevenueCat,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  isProActive,
} from '@/src/lib/revenuecat';
import { useProStore } from '@/src/stores/useProStore';

export function useRevenueCat() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const { activate, deactivate } = useProStore();

  useEffect(() => {
    (async () => {
      try {
        await initRevenueCat();

        // Check current entitlements
        const info = await getCustomerInfo();
        if (info && isProActive(info)) {
          activate();
        }

        // Load offerings
        const current = await getOfferings();
        setOffering(current);
      } catch (e) {
        // RevenueCat not available (Expo Go / simulator without StoreKit config)
        if (__DEV__) {
          console.log('[RevenueCat] Not available in this environment:', (e as Error).message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const monthlyPackage = offering?.availablePackages.find(
    (p) => p.packageType === 'MONTHLY' || p.product.identifier.includes('monthly')
  ) ?? null;

  const yearlyPackage = offering?.availablePackages.find(
    (p) => p.packageType === 'ANNUAL' || p.product.identifier.includes('yearly')
  ) ?? null;

  const buy = useCallback(async (pkg: PurchasesPackage) => {
    setPurchasing(true);
    try {
      const { isPro } = await purchasePackage(pkg);
      if (isPro) {
        activate();
        return true;
      }
      return false;
    } catch (e: any) {
      if (e.userCancelled) {
        // User cancelled — not an error
        return false;
      }
      Alert.alert('Purchase Error', e?.message ?? 'Something went wrong');
      return false;
    } finally {
      setPurchasing(false);
    }
  }, [activate]);

  const restore = useCallback(async () => {
    setPurchasing(true);
    try {
      const { isPro } = await restorePurchases();
      if (isPro) {
        activate();
        Alert.alert('Restored', 'Your Pro subscription has been restored.');
        return true;
      } else {
        Alert.alert('No Purchase Found', 'We couldn\'t find an active Pro subscription for this account.');
        return false;
      }
    } catch (e: any) {
      Alert.alert('Restore Error', e?.message ?? 'Something went wrong');
      return false;
    } finally {
      setPurchasing(false);
    }
  }, [activate]);

  return {
    offering,
    monthlyPackage,
    yearlyPackage,
    loading,
    purchasing,
    buy,
    restore,
  };
}
