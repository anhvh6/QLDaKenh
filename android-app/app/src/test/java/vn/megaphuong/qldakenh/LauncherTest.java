package vn.megaphuong.qldakenh;

import android.os.Bundle;
import android.os.Looper;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.PackageInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.SigningInfo;
import android.content.pm.Signature;
import android.net.Uri;
import android.content.ComponentName;
import android.content.Intent;
import android.Manifest;
import androidx.browser.customtabs.CustomTabsCallback;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Robolectric;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {35, 36})
public class LauncherTest {
    static class OriginalLauncher extends LauncherActivity {
        CustomTabsCallback callback() { return getCustomTabsCallback(); }
    }

    @Test public void activityCreatesAndLaunchesWebsiteWithoutNativeCrash() {
        var browser = new ResolveInfo();
        browser.activityInfo = new ActivityInfo();
        browser.activityInfo.packageName = "com.android.chrome";
        browser.activityInfo.name = "com.android.chrome.Main";
        browser.activityInfo.applicationInfo = new ApplicationInfo();
        browser.activityInfo.applicationInfo.packageName = "com.android.chrome";
        var pkg = new PackageInfo();
        pkg.packageName = "com.android.chrome";
        pkg.applicationInfo = browser.activityInfo.applicationInfo;
        pkg.versionName = "130.0.0";
        pkg.signingInfo = new SigningInfo();
        Shadows.shadowOf(pkg.signingInfo).setSignatures(new Signature[]{new Signature(new byte[]{1,2,3})});
        var pm = Shadows.shadowOf(RuntimeEnvironment.getApplication().getPackageManager());
        pm.installPackage(pkg);
        pm.addResolveInfoForIntent(new Intent(Intent.ACTION_VIEW)
                .addCategory(Intent.CATEGORY_BROWSABLE).setData(Uri.fromParts("http", "", null)), browser);
        var launch = new Intent(RuntimeEnvironment.getApplication(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        var controller = Robolectric.buildActivity(MainActivity.class, launch).create();
        var browserIntent = Shadows.shadowOf(controller.get()).getNextStartedActivity();
        assertNotNull(browserIntent);
        assertEquals("https://quanlydakenh.vercel.app/", browserIntent.getDataString());
        controller.destroy();
    }

    @Test public void reproduceLibraryCrashAndKeepAppCallbackAlive() {
        Bundle warning = new Bundle();
        warning.putString("crash_reason", "Network or origin navigation failure");
        // The provider uses extraCallbackWithResult; the default posts a crash
        // onto the main looper rather than throwing inside the callback itself.
        new OriginalLauncher().callback().extraCallbackWithResult("quality_enforcement.crash", warning);
        assertThrows(RuntimeException.class, () -> Shadows.shadowOf(Looper.getMainLooper()).idle());
        new MainActivity().getCustomTabsCallback().extraCallbackWithResult("quality_enforcement.crash", warning);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        new MainActivity().getCustomTabsCallback().onNavigationEvent(CustomTabsCallback.NAVIGATION_FAILED, warning);
    }

    @Test public void launcherUsesFixAndSupportsResizeAndNotificationFocus() throws Exception {
        var app = RuntimeEnvironment.getApplication();
        var pm = app.getPackageManager();
        var launch = pm.getLaunchIntentForPackage(app.getPackageName());
        assertNotNull(launch);
        assertEquals(MainActivity.class.getName(), launch.getComponent().getClassName());
        var info = pm.getActivityInfo(launch.getComponent(), PackageManager.GET_META_DATA);
        assertEquals("https://quanlydakenh.vercel.app/", info.metaData.getString("android.support.customtabs.trusted.DEFAULT_URL"));
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED, info.screenOrientation);
        assertEquals(PackageManager.PERMISSION_GRANTED, pm.checkPermission(Manifest.permission.REORDER_TASKS, app.getPackageName()));
        assertTrue(pm.getActivityInfo(new ComponentName(app.getPackageName(),
                "com.google.androidbrowserhelper.trusted.FocusActivity"), 0).exported);
        assertNotNull(pm.getActivityInfo(new ComponentName(app.getPackageName(),
                "com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity"),
                PackageManager.MATCH_DISABLED_COMPONENTS));
        assertFalse(pm.getActivityInfo(new ComponentName(app.getPackageName(),
                "com.google.androidbrowserhelper.trusted.NotificationPermissionRequestActivity"), 0).exported);
    }
}
