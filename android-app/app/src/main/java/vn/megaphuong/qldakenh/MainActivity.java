package vn.megaphuong.qldakenh;

import androidx.browser.customtabs.CustomTabsCallback;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** A provider's quality warning must not terminate the business app process. */
public class MainActivity extends LauncherActivity {
    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        // LauncherActivity defaults to QualityEnforcer, which throws an uncaught
        // RuntimeException on quality_enforcement.crash. Keep browser validation
        // and its normal error UI, without crashing our host activity.
        return new CustomTabsCallback();
    }
}
